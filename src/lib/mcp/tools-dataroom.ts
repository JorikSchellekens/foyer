import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { liveLink, visibilityFor } from "@/lib/api-visibility";
import {
  ToolError,
  appOrigin,
  defineTool,
  id,
  nameField,
  parsePath,
  pathField,
} from "./context";
import {
  assertMovable,
  isWithin,
  lockTree,
  looksLike,
  nextOrder,
  pathOf,
  requireRoom,
  resolveRoomFolder,
  sameName,
  type Tx,
} from "./tree";
import { placeInRoom } from "./documents";
import { requireShareForShared, whatIs } from "./shared";

/** Thrown inside a transaction to undo a dry run while keeping its report. */
class DryRun<T> extends Error {
  constructor(public report: T) {
    super("dry run");
  }
}

const description = z
  .string()
  .max(2000)
  .transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "").trim());

const roomFolderRef = {
  folderId: id("folder").optional(),
  folderPath: pathField
    .optional()
    .describe('The folder, by path inside the room, for example "Financials/2025". Give folderId or folderPath.'),
};

async function findRoomFolder(
  tx: Tx,
  dataroomId: string,
  a: { folderId?: string; folderPath?: string }
) {
  if (!a.folderId && !parsePath(a.folderPath).length)
    throw new ToolError('Say which folder, with folderId or folderPath (for example "Financials/2025").');
  const folderId = await resolveRoomFolder(tx, dataroomId, a, { create: false });
  const folders = await tx.dataroomFolder.findMany({ where: { dataroomId } });
  const byId = new Map(folders.map((f) => [f.id, f]));
  return { folder: byId.get(folderId!)!, folders, byId };
}

export function registerDataroomTools(server: McpServer) {
  defineTool(server, {
    name: "create_dataroom",
    title: "Create data room",
    description:
      "Create an empty data room. Nobody outside the team can see it until a sharing link is made for it. Fill it with organize_dataroom, or by giving its dataroomId to the upload and add tools.",
    scope: "write",
    input: {
      name: nameField("Data room name", 120),
      description: description.optional().describe("Shown to visitors on the room's front page."),
    },
    handler: async (p, a) => {
      const twin = await db.dataroom.findFirst({
        where: { teamId: p.teamId, name: { equals: a.name, mode: "insensitive" } },
        select: { id: true },
      });
      const room = await db.dataroom.create({
        data: { teamId: p.teamId, name: a.name, description: a.description || null },
      });
      // Someone restricted to specific rooms would otherwise lose sight of
      // the room they just made; as its creator they get manage access to it.
      let granted = false;
      if (p.ctx.role === "MEMBER") {
        const scoped = await db.resourcePermission.count({
          where: { memberId: p.ctx.member.id, resourceType: "DATAROOM" },
        });
        if (scoped > 0) {
          await db.resourcePermission.create({
            data: {
              memberId: p.ctx.member.id,
              resourceType: "DATAROOM",
              resourceId: room.id,
              level: "MANAGE",
            },
          });
          granted = true;
        }
      }
      return {
        data: {
          dataroomId: room.id,
          name: room.name,
          url: `${appOrigin()}/datarooms/${room.id}`,
          ...(twin
            ? { warning: `Another data room is already named "${room.name}". If this call was a retry, one of them is a duplicate.` }
            : {}),
        },
        audit: `Created data room "${room.name}"${granted ? ` (its creator, ${p.ctx.user.email}, was given manage access to it)` : ""}`,
      };
    },
  });

  defineTool(server, {
    name: "update_dataroom",
    title: "Rename or describe data room",
    description:
      "Change a data room's name or description. Visitors see both on the room's front page, at once.",
    scope: "write",
    idempotent: true,
    input: {
      dataroomId: id("data room"),
      name: nameField("Data room name", 120).optional(),
      description: description.optional().describe('New description. Use "" to remove it.'),
    },
    handler: async (p, a) => {
      const room = await requireRoom(p, a.dataroomId, "EDIT");
      await requireShareForShared(p, { dataroomId: room.id }, "Changing this data room");
      if (a.name === undefined && a.description === undefined)
        throw new ToolError("Give a new name, a new description, or both.");
      const updated = await db.dataroom.update({
        where: { id: room.id },
        data: {
          ...(a.name !== undefined ? { name: a.name } : {}),
          ...(a.description !== undefined ? { description: a.description || null } : {}),
        },
      });
      return {
        data: { dataroomId: room.id, name: updated.name, description: updated.description, previousName: room.name },
        audit:
          a.name && a.name !== room.name
            ? `Renamed data room "${room.name}" to "${a.name}"`
            : `Updated the description of data room "${room.name}"`,
      };
    },
  });

  defineTool(server, {
    name: "organize_dataroom",
    title: "Place documents in a data room",
    description:
      'The main tool for structuring a room, and the tool for moving a document to another folder of the same room. Give placements: each a document and the folder path it belongs in ("" for the room\'s top level), optionally with a new display name. A document not yet in the room is added; one already in the room is moved; one already in that folder is left alone. Folders that do not exist are created: check `foldersCreated` and `warnings` in the result, because a misspelt path makes a new folder (set createFolders to false to make that an error instead). Every placement is applied or none is. Up to 300 per call. Use dryRun to preview a large change. Order: by default arriving documents go to the end of their folder; with order "listed_first" the listed documents are put at the top of each folder in the order given. Visitors holding a link to the whole room see the result at once.',
    scope: "write",
    idempotent: true,
    input: {
      dataroomId: id("data room"),
      placements: z
        .array(
          z.strictObject({
            documentId: id("document"),
            folderPath: pathField.describe('Folder inside the room for this document, for example "Financials/2025". "" is the room\'s top level.'),
            name: nameField("Document name").optional().describe("Optional new display name for the document."),
          })
        )
        .min(1)
        .max(300),
      createFolders: z.boolean().default(true).describe("Create folders that do not exist. Set false to fail on an unknown path instead."),
      order: z.enum(["append", "listed_first"]).default("append"),
      dryRun: z.boolean().default(false).describe("Report what would change without changing anything."),
    },
    handler: async (p, a) => {
      const room = await requireRoom(p, a.dataroomId, "EDIT");
      await requireShareForShared(p, { dataroomId: room.id }, "Changing this data room");
      const v = await visibilityFor(p);
      const ids = a.placements.map((x) => x.documentId);
      const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
      if (dupes.length)
        throw new ToolError(
          `Each document can be placed once per call, and ${[...new Set(dupes)].slice(0, 5).join(", ")} is listed more than once. A document sits in one folder of a room.`
        );
      // Reject malformed paths before any work.
      const paths = a.placements.map((x) => parsePath(x.folderPath).join("/"));

      const docs = await db.document.findMany({
        where: { AND: [{ id: { in: ids } }, v.doc] },
        select: { id: true, name: true },
      });
      const nameOf = new Map(docs.map((d) => [d.id, d.name]));
      const missing = ids.filter((x) => !nameOf.has(x));
      if (missing.length)
        throw new ToolError(
          `No document with id ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (and ${missing.length - 5} more)` : ""}.${await whatIs(p, v, missing[0])} Nothing was changed. Call list_documents for the right ids.`
        );
      const renames = a.placements.filter((x) => x.name && x.name !== nameOf.get(x.documentId));
      if (renames.length) {
        const editable = await db.document.findMany({
          where: { AND: [{ id: { in: renames.map((r) => r.documentId) } }, v.docEdit] },
          select: { id: true },
        });
        if (editable.length !== renames.length)
          throw new ToolError(
            "The owner of this key may not rename some of these documents, because they are also used outside the rooms the owner can edit. Remove `name` from those placements. Nothing was changed."
          );
      }

      const already = await db.dataroomDocument.findMany({
        where: { dataroomId: room.id, documentId: { in: ids } },
        select: { documentId: true },
      });
      // Bringing a document into another room widens who can see it, so it
      // takes the right to change that document, not just to read it.
      const adding = ids.filter((x) => !already.some((d) => d.documentId === x));
      if (v.restricted && adding.length) {
        const mayAdd = await db.document.count({
          where: { AND: [{ id: { in: adding } }, v.docEdit] },
        });
        if (mayAdd !== adding.length)
          throw new ToolError(
            "The owner of this key may view some of these documents but not add them to another room: their access is limited to specific data rooms, and adding a document elsewhere needs edit access to it. Nothing was changed."
          );
      }
      if (renames.length)
        await requireShareForShared(p, { documentIds: renames.map((r) => r.documentId) }, "Renaming");

      type Row = { documentId: string; name: string; folderPath: string };
      type Report = {
        foldersCreated: string[];
        added: Row[];
        moved: (Row & { fromFolderPath: string })[];
        renamed: { documentId: string; name: string; previousName: string }[];
        unchanged: number;
        warnings: string[];
      };
      const run = async (): Promise<Report> =>
        db.$transaction(
          async (tx) => {
            await lockTree(tx, `room:${room.id}`);
            const report: Report = { foldersCreated: [], added: [], moved: [], renamed: [], unchanged: 0, warnings: [] };
            const before = await tx.dataroomFolder.findMany({ where: { dataroomId: room.id } });
            const beforeById = new Map(before.map((f) => [f.id, f]));
            const was = new Map(
              (
                await tx.dataroomDocument.findMany({
                  where: { dataroomId: room.id, documentId: { in: ids } },
                })
              ).map((d) => [d.documentId, d.folderId])
            );
            const order = { next: await nextOrder(tx, room.id) };
            const folderIds = new Map<string, string | null>();
            for (let i = 0; i < a.placements.length; i++) {
              const path = paths[i];
              const key = path.toLowerCase();
              if (!folderIds.has(key))
                folderIds.set(
                  key,
                  await resolveRoomFolder(
                    tx,
                    room.id,
                    { folderPath: path },
                    { create: a.createFolders, created: report.foldersCreated, order }
                  )
                );
              const documentId = ids[i];
              const wanted = a.placements[i].name;
              const name = wanted ?? nameOf.get(documentId)!;
              if (wanted && wanted !== nameOf.get(documentId)) {
                await tx.document.update({ where: { id: documentId }, data: { name: wanted } });
                report.renamed.push({ documentId, name: wanted, previousName: nameOf.get(documentId)! });
              }
              const outcome = await placeInRoom(tx, room.id, documentId, folderIds.get(key) ?? null, order);
              // The folder's id for now; turned into its real path below, so
              // the result shows the folder's own spelling, not the caller's.
              const row = { documentId, name, folderPath: folderIds.get(key) ?? "" };
              if (outcome === "added") report.added.push(row);
              else if (outcome === "moved")
                report.moved.push({ ...row, fromFolderPath: pathOf(beforeById, was.get(documentId) ?? null) });
              else report.unchanged++;
            }

            const after = await tx.dataroomFolder.findMany({ where: { dataroomId: room.id } });
            const afterById = new Map(after.map((f) => [f.id, f]));
            for (const row of [...report.added, ...report.moved])
              row.folderPath = pathOf(afterById, row.folderPath || null);
            // A new folder beside one with nearly the same name is usually a
            // slip ("Legal" or "Leagl" next to "04 Legal"), and it is live for
            // visitors the moment it exists.
            for (const f of after) {
              if (beforeById.has(f.id)) continue;
              const twin = after.find(
                (o) =>
                  o.id !== f.id &&
                  o.parentId === f.parentId &&
                  beforeById.has(o.id) &&
                  looksLike(o.name, f.name)
              );
              if (twin)
                report.warnings.push(
                  a.dryRun
                    ? `This would create a new folder "${pathOf(afterById, f.id)}" next to the existing folder "${pathOf(afterById, twin.id)}". If you meant the existing one, use folderPath "${pathOf(afterById, twin.id)}".`
                    : `Created a new folder "${pathOf(afterById, f.id)}" next to the existing folder "${pathOf(afterById, twin.id)}". If you meant the existing one, place the documents there (folderPath "${pathOf(afterById, twin.id)}") and delete the new folder with delete_dataroom_folder.`
                );
            }

            if (a.order === "listed_first") {
              for (const [key, folderId] of folderIds) {
                const listed = ids.filter((_, i) => paths[i].toLowerCase() === key);
                const [fs, ds] = await Promise.all([
                  tx.dataroomFolder.findMany({ where: { dataroomId: room.id, parentId: folderId } }),
                  tx.dataroomDocument.findMany({ where: { dataroomId: room.id, folderId } }),
                ]);
                const rest = [
                  ...fs.map((f) => ({ kind: "f" as const, row: f.id, o: f.orderIndex, at: f.createdAt.getTime() })),
                  ...ds
                    .filter((d) => !listed.includes(d.documentId))
                    .map((d) => ({ kind: "d" as const, row: d.id, o: d.orderIndex, at: d.createdAt.getTime() })),
                ].sort((x, y) => x.o - y.o || x.at - y.at);
                const rowOf = new Map(ds.map((d) => [d.documentId, d.id]));
                let n = 0;
                for (const documentId of listed)
                  await tx.dataroomDocument.update({ where: { id: rowOf.get(documentId)! }, data: { orderIndex: n++ } });
                for (const r of rest)
                  if (r.kind === "f") await tx.dataroomFolder.update({ where: { id: r.row }, data: { orderIndex: n++ } });
                  else await tx.dataroomDocument.update({ where: { id: r.row }, data: { orderIndex: n++ } });
              }
            }
            if (a.dryRun) throw new DryRun(report);
            return report;
          },
          { timeout: 30_000, maxWait: 5_000 }
        );

      let report: Report;
      try {
        report = await run();
      } catch (e) {
        if (!(e instanceof DryRun)) throw e;
        report = (e as DryRun<Report>).report;
      }
      const changed = report.added.length + report.moved.length + report.renamed.length + report.foldersCreated.length;
      const partialLinks =
        a.dryRun || !report.added.length
          ? 0
          : await db.link.count({ where: { dataroomId: room.id, fullAccess: false, ...liveLink() } });
      if (partialLinks)
        report.warnings.push(
          `${partialLinks} sharing link(s) to this room show only selected items. The documents added now stay hidden on those links until someone grants them in the Foyer web app.`
        );
      return {
        data: {
          dryRun: a.dryRun,
          dataroom: room.name,
          foldersCreated: report.foldersCreated,
          added: report.added,
          moved: report.moved,
          renamed: report.renamed,
          unchanged: report.unchanged,
          warnings: report.warnings,
        },
        audit:
          a.dryRun || !changed
            ? undefined
            : [
                `Organised data room "${room.name}": added ${report.added.length}, moved ${report.moved.length}, renamed ${report.renamed.length}, created ${report.foldersCreated.length} folder(s).`,
                report.foldersCreated.length ? `Folders created: ${report.foldersCreated.slice(0, 15).join(", ")}.` : "",
                report.added.length ? `Added: ${report.added.slice(0, 15).map((r) => `"${r.name}" to ${r.folderPath || "top level"}`).join("; ")}${report.added.length > 15 ? "; ..." : ""}.` : "",
                report.moved.length ? `Moved: ${report.moved.slice(0, 15).map((r) => `"${r.name}" from ${r.fromFolderPath || "top level"} to ${r.folderPath || "top level"}`).join("; ")}${report.moved.length > 15 ? "; ..." : ""}.` : "",
                report.renamed.length ? `Renamed: ${report.renamed.slice(0, 15).map((r) => `"${r.previousName}" to "${r.name}"`).join("; ")}${report.renamed.length > 15 ? "; ..." : ""}.` : "",
              ]
                .filter(Boolean)
                .join(" "),
      };
    },
  });

  defineTool(server, {
    name: "create_dataroom_folder",
    title: "Create data room folder",
    description:
      'Create a folder in a data room by path, for example "Financials/2025". Missing levels are created and existing ones reused, so calling it twice is safe. organize_dataroom creates folders as needed; use this only for a folder that should exist while still empty. Visitors see empty folders.',
    scope: "write",
    idempotent: true,
    input: {
      dataroomId: id("data room"),
      folderPath: pathField.describe('Folder path to create, for example "Financials/2025". Cannot be empty.'),
    },
    handler: async (p, a) => {
      const room = await requireRoom(p, a.dataroomId, "EDIT");
      await requireShareForShared(p, { dataroomId: room.id }, "Changing this data room");
      const path = parsePath(a.folderPath).join("/");
      if (!path) throw new ToolError('Give a folder path, for example "Financials/2025".');
      const created: string[] = [];
      const folderId = await db.$transaction(async (tx) => {
        await lockTree(tx, `room:${room.id}`);
        return resolveRoomFolder(tx, room.id, { folderPath: path }, { create: true, created });
      });
      return {
        data: { folderId, folderPath: path, foldersCreated: created },
        audit: created.length
          ? `Created folder ${created.join(", ")} in data room "${room.name}"`
          : undefined,
      };
    },
  });

  defineTool(server, {
    name: "update_dataroom_folder",
    title: "Rename or move data room folder",
    description:
      'Rename a folder in a data room, move it under another folder, or both. Say which folder with folderId or folderPath. To move it, give parentPath ("" for the room\'s top level) or parentFolderId; omit both to leave it where it is. Everything inside moves with it, and paths under it change. A moved folder goes to the end of its new parent; use reorder_dataroom to position it. Visitors see the change at once.',
    scope: "write",
    idempotent: true,
    input: {
      dataroomId: id("data room"),
      ...roomFolderRef,
      name: nameField("Folder name", 120).optional(),
      parentFolderId: id("folder").optional(),
      parentPath: pathField.optional().describe('New parent folder by path. "" is the room\'s top level.'),
    },
    handler: async (p, a) => {
      const room = await requireRoom(p, a.dataroomId, "EDIT");
      await requireShareForShared(p, { dataroomId: room.id }, "Changing this data room");
      if (a.name?.includes("/")) throw new ToolError('Folder names cannot contain "/".');
      const moving = a.parentFolderId !== undefined || a.parentPath !== undefined;
      if (!a.name && !moving) throw new ToolError("Give a new name, a new parent, or both.");
      return db.$transaction(async (tx) => {
        await lockTree(tx, `room:${room.id}`);
        const { folder, folders, byId } = await findRoomFolder(tx, room.id, a);
        const before = pathOf(byId, folder.id);
        let parentId = folder.parentId;
        if (moving) {
          parentId = await resolveRoomFolder(
            tx,
            room.id,
            { folderId: a.parentFolderId, folderPath: a.parentPath },
            { create: false }
          );
          assertMovable(folders, byId, folder.id, parentId);
        }
        const name = a.name ?? folder.name;
        const clash = folders.find(
          (f) => f.id !== folder.id && f.parentId === parentId && sameName(f.name, name)
        );
        if (clash)
          throw new ToolError(
            `There is already a folder named "${clash.name}" there. Pick another name, or place the documents into that folder with organize_dataroom.`
          );
        const reparented = parentId !== folder.parentId;
        await tx.dataroomFolder.update({
          where: { id: folder.id },
          data: {
            name,
            parentId,
            ...(reparented ? { orderIndex: await nextOrder(tx, room.id) } : {}),
          },
        });
        byId.set(folder.id, { ...folder, name, parentId });
        const after = pathOf(byId, folder.id);
        return {
          data: { folderId: folder.id, folderPath: after, previousFolderPath: before },
          audit: before === after ? undefined : `Folder ${before} -> ${after} in data room "${room.name}"`,
        };
      });
    },
  });

  defineTool(server, {
    name: "delete_dataroom_folder",
    title: "Delete data room folder",
    description:
      "Delete a folder and its subfolders from a data room. Does not delete any document. By default the documents inside move up to the deleted folder's parent; set removeDocuments to take them out of the room instead (they stay in the library).",
    scope: "write",
    destructive: true,
    input: {
      dataroomId: id("data room"),
      ...roomFolderRef,
      removeDocuments: z.boolean().default(false),
    },
    handler: async (p, a) => {
      const room = await requireRoom(p, a.dataroomId, "EDIT");
      await requireShareForShared(p, { dataroomId: room.id }, "Changing this data room");
      return db.$transaction(async (tx) => {
        await lockTree(tx, `room:${room.id}`);
        const { folder, folders, byId } = await findRoomFolder(tx, room.id, a);
        const subtree = folders.filter((f) => isWithin(byId, f.id, folder.id)).map((f) => f.id);
        const path = pathOf(byId, folder.id);
        const inside = await tx.dataroomDocument.findMany({
          where: { dataroomId: room.id, folderId: { in: subtree } },
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });
        if (a.removeDocuments) {
          await tx.dataroomDocument.deleteMany({ where: { id: { in: inside.map((d) => d.id) } } });
        } else {
          let order = await nextOrder(tx, room.id);
          for (const d of inside)
            await tx.dataroomDocument.update({
              where: { id: d.id },
              data: { folderId: folder.parentId, orderIndex: order++ },
            });
        }
        await tx.dataroomFolder.delete({ where: { id: folder.id } });
        const to = pathOf(byId, folder.parentId) || "top level";
        return {
          data: {
            deletedFolderPath: path,
            foldersDeleted: subtree.length,
            ...(a.removeDocuments
              ? { documentsRemovedFromRoom: inside.length }
              : { documentsMoved: inside.length, documentsMovedTo: to }),
          },
          audit: `Deleted folder ${path} (${subtree.length} folder(s)) from data room "${room.name}"; ${inside.length} document(s) ${a.removeDocuments ? "removed from the room" : `moved to ${to}`}`,
        };
      });
    },
  });

  defineTool(server, {
    name: "remove_from_dataroom",
    title: "Remove documents from data room",
    description:
      "Does not delete anything. Takes up to 200 documents out of a data room: they stay in the library and in any other room, and visitors to this room stop seeing them at once. The result lists any folders left empty; set pruneEmptyFolders to delete those too.",
    scope: "write",
    destructive: true,
    idempotent: true,
    input: {
      dataroomId: id("data room"),
      documentIds: z.array(id("document")).min(1).max(200),
      pruneEmptyFolders: z.boolean().default(false),
    },
    handler: async (p, a) => {
      const room = await requireRoom(p, a.dataroomId, "EDIT");
      await requireShareForShared(p, { dataroomId: room.id }, "Changing this data room");
      const ids = [...new Set(a.documentIds)];
      return db.$transaction(async (tx) => {
        await lockTree(tx, `room:${room.id}`);
        const folders = await tx.dataroomFolder.findMany({ where: { dataroomId: room.id } });
        const byId = new Map(folders.map((f) => [f.id, f]));
        const present = await tx.dataroomDocument.findMany({
          where: { dataroomId: room.id, documentId: { in: ids } },
          include: { document: { select: { name: true } } },
        });
        await tx.dataroomDocument.deleteMany({ where: { id: { in: present.map((d) => d.id) } } });
        const touched = [...new Set(present.map((d) => d.folderId).filter((f): f is string => !!f))];
        const empty: { folderId: string; folderPath: string }[] = [];
        for (const folderId of touched) {
          const [docs, subs] = await Promise.all([
            tx.dataroomDocument.count({ where: { dataroomId: room.id, folderId } }),
            tx.dataroomFolder.count({ where: { dataroomId: room.id, parentId: folderId } }),
          ]);
          if (docs + subs === 0) empty.push({ folderId, folderPath: pathOf(byId, folderId) });
        }
        if (a.pruneEmptyFolders && empty.length)
          await tx.dataroomFolder.deleteMany({ where: { id: { in: empty.map((e) => e.folderId) } } });
        const notInRoom = ids.filter((i) => !present.some((d) => d.documentId === i));
        return {
          data: {
            removed: present.map((d) => ({
              documentId: d.documentId,
              name: d.document.name,
              fromFolderPath: pathOf(byId, d.folderId),
            })),
            ...(notInRoom.length ? { notInRoom } : {}),
            ...(empty.length
              ? a.pruneEmptyFolders
                ? { emptyFoldersDeleted: empty.map((e) => e.folderPath) }
                : {
                    emptyFoldersLeft: empty,
                    next: "Visitors see empty folders. To delete these, call delete_dataroom_folder with each folderPath.",
                  }
              : {}),
          },
          audit: present.length
            ? `Removed ${present.length} document(s) from data room "${room.name}": ${present.slice(0, 10).map((d) => `"${d.document.name}"`).join(", ")}${present.length > 10 ? ` and ${present.length - 10} more` : ""}`
            : undefined,
        };
      });
    },
  });

  defineTool(server, {
    name: "reorder_dataroom",
    title: "Reorder a data room folder",
    description:
      'Set the display order inside one folder of a data room (folderPath "" or omitted for the room\'s top level). Folders and documents share one order, so they can be mixed. List the items in the order you want, each as {"documentId": "..."} or {"folderId": "..."}, exactly as get_dataroom names them. Items you leave out keep their relative order after the listed ones. Returns the resulting order.',
    scope: "write",
    idempotent: true,
    input: {
      dataroomId: id("data room"),
      folderId: id("folder").optional(),
      folderPath: pathField.optional().describe('The folder to reorder, by path. "" or omitted is the room\'s top level.'),
      order: z
        .array(
          z.strictObject({
            documentId: id("document").optional(),
            folderId: id("folder").optional(),
          })
        )
        .min(1)
        .max(500),
    },
    handler: async (p, a) => {
      const room = await requireRoom(p, a.dataroomId, "EDIT");
      await requireShareForShared(p, { dataroomId: room.id }, "Changing this data room");
      for (const o of a.order)
        if (!!o.documentId === !!o.folderId)
          throw new ToolError('Each item in order needs exactly one of documentId or folderId, for example {"documentId": "..."}.');
      return db.$transaction(async (tx) => {
        await lockTree(tx, `room:${room.id}`);
        const parentId = await resolveRoomFolder(
          tx,
          room.id,
          { folderId: a.folderId, folderPath: a.folderPath },
          { create: false }
        );
        const [allFolders, allDocs] = await Promise.all([
          tx.dataroomFolder.findMany({ where: { dataroomId: room.id } }),
          tx.dataroomDocument.findMany({
            where: { dataroomId: room.id },
            include: { document: { select: { name: true } } },
          }),
        ]);
        const byId = new Map(allFolders.map((f) => [f.id, f]));
        const where = pathOf(byId, parentId) || "top level";
        type Item = { kind: "folder" | "document"; key: string; ref: string; name: string; row: string; order: number; at: number };
        const here: Item[] = [
          ...allFolders
            .filter((f) => f.parentId === parentId)
            .map((f) => ({ kind: "folder" as const, key: `f:${f.id}`, ref: f.id, name: f.name, row: f.id, order: f.orderIndex, at: f.createdAt.getTime() })),
          ...allDocs
            .filter((d) => d.folderId === parentId)
            .map((d) => ({ kind: "document" as const, key: `d:${d.documentId}`, ref: d.documentId, name: d.document.name, row: d.id, order: d.orderIndex, at: d.createdAt.getTime() })),
        ].sort((x, y) => x.order - y.order || x.at - y.at);
        const byKey = new Map(here.map((i) => [i.key, i]));
        const wanted = a.order.map((o) => (o.folderId ? `f:${o.folderId}` : `d:${o.documentId}`));
        if (new Set(wanted).size !== wanted.length)
          throw new ToolError("An item is listed more than once in order.");
        const problems: string[] = [];
        for (const o of a.order) {
          if (byKey.has(o.folderId ? `f:${o.folderId}` : `d:${o.documentId}`)) continue;
          if (o.documentId) {
            const elsewhere = allDocs.find((d) => d.documentId === o.documentId);
            problems.push(
              elsewhere
                ? `"${elsewhere.document.name}" is in ${pathOf(byId, elsewhere.folderId) || "the top level"}, not ${where}`
                : byId.has(o.documentId)
                  ? `${o.documentId} is a folder; pass it as folderId`
                  : `document ${o.documentId} is not in this data room`
            );
          } else {
            const elsewhere = byId.get(o.folderId!);
            problems.push(
              elsewhere
                ? `folder "${pathOf(byId, elsewhere.id)}" is not directly inside ${where}`
                : allDocs.some((d) => d.documentId === o.folderId)
                  ? `${o.folderId} is a document; pass it as documentId`
                  : `folder ${o.folderId} is not in this data room`
            );
          }
        }
        if (problems.length)
          throw new ToolError(
            `Only items directly inside ${where} can be ordered there: ${problems.slice(0, 5).join("; ")}. Nothing was changed. Move items with organize_dataroom or update_dataroom_folder first.`
          );
        const final = [
          ...wanted.map((k) => byKey.get(k)!),
          ...here.filter((i) => !wanted.includes(i.key)),
        ];
        const changed = final.some((item, i) => here[i].key !== item.key);
        for (let i = 0; i < final.length; i++) {
          const item = final[i];
          if (item.kind === "folder")
            await tx.dataroomFolder.update({ where: { id: item.row }, data: { orderIndex: i } });
          else await tx.dataroomDocument.update({ where: { id: item.row }, data: { orderIndex: i } });
        }
        return {
          data: {
            folderPath: pathOf(byId, parentId),
            order: final.map((i) =>
              i.kind === "folder" ? { folderId: i.ref, name: i.name } : { documentId: i.ref, name: i.name }
            ),
          },
          audit: changed
            ? `Reordered ${where} of data room "${room.name}": ${final.slice(0, 12).map((i) => i.name).join(", ")}${final.length > 12 ? ", ..." : ""}`
            : undefined,
        };
      });
    },
  });
}
