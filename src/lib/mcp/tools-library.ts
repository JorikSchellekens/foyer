import "server-only";
import { z } from "zod";
import { isIP } from "net";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { parseNotionUrl } from "@/lib/notion";
import { parseExternalUrl } from "@/lib/external-link";
import { deleteObject, newFileKey, putObject } from "@/lib/storage";
import { docTypeFromName } from "@/lib/doc-types";
import { contentTypeForFile } from "@/lib/content-type";
import { visibilityFor, type Visibility } from "@/lib/api-visibility";
import type { ApiPrincipal } from "@/lib/api-auth";
import {
  ToolError,
  appOrigin,
  clean,
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
  pathOf,
  requireRoom,
  resolveLibraryFolder,
  resolveRoomFolder,
  sameName,
  type Tx,
} from "./tree";
import { createExternalDocument, createFileDocument, placeInRoom } from "./documents";
import { requireDoc, requireLibrary, requireShareForShared } from "./shared";
import {
  MAX_TEXT_BYTES,
  MAX_UPLOAD_BYTES,
  UPLOAD_TTL_MS,
  newUploadSecret,
} from "./uploads";

/** Where a new document goes: a library folder, and optionally a data room. */
const libraryFolderPath = pathField
  .optional()
  .describe(
    'Library folder to file the document in, for example "Legal/Contracts". Missing folders are created. Omit for the library\'s top level.'
  );
const roomFolderPath = pathField
  .optional()
  .describe(
    "Folder inside that data room, for example \"Financials/2025\". Missing folders are created. Omit for the room's top level. Needs dataroomId."
  );
const placement = {
  folderPath: libraryFolderPath,
  dataroomId: id("data room")
    .optional()
    .describe(
      "Also add the document to this data room, at the end of the folder. Visitors holding a link to the whole room see it at once."
    ),
  dataroomFolderPath: roomFolderPath,
};

type Placement = {
  folderPath?: string;
  dataroomId?: string;
  dataroomFolderPath?: string;
};

/** Check a placement and the right to use it, before anything is created. */
async function checkPlacement(p: ApiPrincipal, v: Visibility, a: Placement, doing: string) {
  if (a.dataroomFolderPath !== undefined && !a.dataroomId)
    throw new ToolError("dataroomFolderPath needs dataroomId.");
  parsePath(a.dataroomFolderPath);
  if (parsePath(a.folderPath).length) requireLibrary(v, "Filing into library folders");
  if (!a.dataroomId) return null;
  const room = await requireRoom(p, a.dataroomId, "EDIT");
  await requireShareForShared(p, { dataroomId: room.id }, doing);
  return room;
}

async function place(
  tx: Tx,
  p: ApiPrincipal,
  a: Placement,
  room: { id: string; name: string } | null,
  documentId: (folderId: string | null) => Promise<string>
) {
  if (parsePath(a.folderPath).length) await lockTree(tx, `lib:${p.teamId}`);
  if (room) await lockTree(tx, `room:${room.id}`);
  const folderId = await resolveLibraryFolder(
    tx,
    p.teamId,
    { folderPath: a.folderPath },
    { create: true }
  );
  const docId = await documentId(folderId);
  if (room)
    await placeInRoom(
      tx,
      room.id,
      docId,
      await resolveRoomFolder(tx, room.id, { folderPath: a.dataroomFolderPath }, { create: true })
    );
  return docId;
}

function placedOut(a: Placement, room: { id: string; name: string } | null) {
  return {
    libraryFolderPath: parsePath(a.folderPath).join("/"),
    ...(room
      ? {
          dataroom: {
            dataroomId: room.id,
            name: room.name,
            folderPath: parsePath(a.dataroomFolderPath).join("/"),
            position: "last in that folder; use reorder_dataroom to move it",
          },
        }
      : {}),
  };
}

function placedSummary(a: Placement, roomName: string | null) {
  const lib = parsePath(a.folderPath).join("/") || "top level";
  return roomName
    ? `library ${lib}; data room "${roomName}" ${parsePath(a.dataroomFolderPath).join("/") || "top level"}`
    : `library ${lib}`;
}

const libraryFolderRef = {
  folderId: id("library folder").optional(),
  folderPath: pathField
    .optional()
    .describe('The folder, by path, for example "Legal/Contracts". Give folderId or folderPath.'),
};

async function findLibraryFolder(
  tx: Tx,
  teamId: string,
  a: { folderId?: string; folderPath?: string }
) {
  if (!a.folderId && !parsePath(a.folderPath).length)
    throw new ToolError('Say which folder, with folderId or folderPath (for example "Legal/Contracts").');
  const folderId = await resolveLibraryFolder(tx, teamId, a, { create: false });
  const folders = await tx.folder.findMany({ where: { teamId } });
  const byId = new Map(folders.map((f) => [f.id, f]));
  return { folder: byId.get(folderId!)!, folders, byId };
}

export function registerLibraryTools(server: McpServer) {
  defineTool(server, {
    name: "create_library_folder",
    title: "Create library folder",
    description:
      'Create a folder in the library (the team\'s private filing, not a data room) by path, for example "Legal/Contracts/2025". Every missing level is created and existing levels are reused, so calling it twice is safe. The tools that file documents create folders as needed; use this only for a folder that should exist while empty.',
    scope: "write",
    idempotent: true,
    input: {
      folderPath: pathField.describe('Folder path to create, for example "Legal/Contracts". Cannot be empty.'),
    },
    handler: async (p, a) => {
      requireLibrary(await visibilityFor(p), "Creating library folders");
      const path = parsePath(a.folderPath).join("/");
      if (!path) throw new ToolError('Give a folder path, for example "Legal/Contracts".');
      const created: string[] = [];
      const folderId = await db.$transaction(async (tx) => {
        await lockTree(tx, `lib:${p.teamId}`);
        return resolveLibraryFolder(tx, p.teamId, { folderPath: path }, { create: true, created });
      });
      return {
        data: { folderId, folderPath: path, foldersCreated: created },
        audit: created.length
          ? `Created library folder ${created.join(", ")}`
          : undefined,
      };
    },
  });

  defineTool(server, {
    name: "update_library_folder",
    title: "Rename or move library folder",
    description:
      'Rename a library folder, move it under another folder, or both. Say which folder with folderId or folderPath. To move it, give parentPath ("" for the top level) or parentFolderId; omit both to leave it where it is. Documents and subfolders move with it.',
    scope: "write",
    idempotent: true,
    input: {
      ...libraryFolderRef,
      name: nameField("Folder name", 120).optional(),
      parentFolderId: id("library folder").optional(),
      parentPath: pathField.optional().describe('New parent folder by path. "" is the top level.'),
    },
    handler: async (p, a) => {
      requireLibrary(await visibilityFor(p), "Changing library folders");
      if (a.name?.includes("/")) throw new ToolError('Folder names cannot contain "/".');
      const moving = a.parentFolderId !== undefined || a.parentPath !== undefined;
      if (!a.name && !moving) throw new ToolError("Give a new name, a new parent, or both.");
      return db.$transaction(async (tx) => {
        await lockTree(tx, `lib:${p.teamId}`);
        const { folder, folders, byId } = await findLibraryFolder(tx, p.teamId, a);
        const before = pathOf(byId, folder.id);
        let parentId = folder.parentId;
        if (moving) {
          parentId = await resolveLibraryFolder(
            tx,
            p.teamId,
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
            `There is already a folder named "${clash.name}" there. Pick another name, or move the documents into that folder with move_library_documents.`
          );
        await tx.folder.update({ where: { id: folder.id }, data: { name, parentId } });
        byId.set(folder.id, { ...folder, name, parentId });
        const after = pathOf(byId, folder.id);
        return {
          data: { folderId: folder.id, folderPath: after, previousFolderPath: before },
          audit: before === after ? undefined : `Library folder ${before} -> ${after}`,
        };
      });
    },
  });

  defineTool(server, {
    name: "delete_library_folder",
    title: "Delete library folder",
    description:
      "Delete a library folder and its subfolders. Does not delete any document: every document inside moves up to the deleted folder's parent. Data rooms are not affected.",
    scope: "write",
    destructive: true,
    input: libraryFolderRef,
    handler: async (p, a) => {
      requireLibrary(await visibilityFor(p), "Deleting library folders");
      return db.$transaction(async (tx) => {
        await lockTree(tx, `lib:${p.teamId}`);
        const { folder, folders, byId } = await findLibraryFolder(tx, p.teamId, a);
        const subtree = folders.filter((f) => isWithin(byId, f.id, folder.id)).map((f) => f.id);
        const path = pathOf(byId, folder.id);
        const moved = await tx.document.updateMany({
          where: { teamId: p.teamId, folderId: { in: subtree } },
          data: { folderId: folder.parentId },
        });
        await tx.folder.delete({ where: { id: folder.id } });
        return {
          data: {
            deletedFolderPath: path,
            foldersDeleted: subtree.length,
            documentsMoved: moved.count,
            documentsMovedTo: pathOf(byId, folder.parentId) || "top level",
          },
          audit: `Deleted library folder ${path} (${subtree.length} folder(s)); ${moved.count} document(s) moved up`,
        };
      });
    },
  });

  defineTool(server, {
    name: "move_library_documents",
    title: "File documents in the library",
    description:
      'Library filing only: does not change any data room. To move a document between folders inside a data room, use organize_dataroom. Files up to 200 documents into library folders, each by path (missing folders are created; "" is the top level). All moves happen or none do.',
    scope: "write",
    idempotent: true,
    input: {
      moves: z
        .array(
          z.strictObject({
            documentId: id("document"),
            folderPath: pathField.describe('Library folder for this document. "" is the top level.'),
          })
        )
        .min(1)
        .max(200),
    },
    handler: async (p, a) => {
      requireLibrary(await visibilityFor(p), "Filing in the library");
      const ids = a.moves.map((m) => m.documentId);
      if (new Set(ids).size !== ids.length)
        throw new ToolError("A document is listed more than once in moves.");
      const paths = a.moves.map((m) => parsePath(m.folderPath).join("/"));
      return db.$transaction(async (tx) => {
        await lockTree(tx, `lib:${p.teamId}`);
        const docs = await tx.document.findMany({
          where: { id: { in: ids }, teamId: p.teamId },
          select: { id: true },
        });
        const missing = ids.filter((i) => !docs.some((d) => d.id === i));
        if (missing.length)
          throw new ToolError(
            `No document with id ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (and ${missing.length - 5} more)` : ""}. Nothing was moved.`
          );
        const created: string[] = [];
        const folderIds = new Map<string, string | null>();
        for (let i = 0; i < ids.length; i++) {
          const key = paths[i].toLowerCase();
          if (!folderIds.has(key))
            folderIds.set(
              key,
              await resolveLibraryFolder(tx, p.teamId, { folderPath: paths[i] }, { create: true, created })
            );
          await tx.document.update({
            where: { id: ids[i] },
            data: { folderId: folderIds.get(key) ?? null },
          });
        }
        return {
          data: { moved: ids.length, foldersCreated: created },
          audit: `Filed ${ids.length} document(s) in the library (${[...new Set(paths)].slice(0, 5).map((x) => x || "top level").join(", ")})`,
        };
      });
    },
  });

  defineTool(server, {
    name: "rename_documents",
    title: "Rename documents",
    description:
      'Change the display name of up to 200 documents in one call, for example turning "scan_0043" into "Capitalisation table - September 2026". Visitors see this name in data rooms and on shared links, at once. The stored files and their file names are not changed. All renames happen or none do.',
    scope: "write",
    idempotent: true,
    input: {
      renames: z
        .array(z.strictObject({ documentId: id("document"), name: nameField("Document name") }))
        .min(1)
        .max(200),
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const ids = a.renames.map((r) => r.documentId);
      if (new Set(ids).size !== ids.length)
        throw new ToolError("A document is listed more than once in renames.");
      const docs = await db.document.findMany({
        where: { AND: [{ id: { in: ids } }, v.docEdit] },
        select: { id: true, name: true },
      });
      const nameOf = new Map(docs.map((d) => [d.id, d.name]));
      const missing = ids.filter((i) => !nameOf.has(i));
      if (missing.length) {
        // Reports "cannot change" rather than "not found" where that is the case.
        await requireDoc(p, v, missing[0], "edit");
        throw new ToolError(`No document with id ${missing.slice(0, 5).join(", ")}. Nothing was renamed.`);
      }
      await requireShareForShared(p, { documentIds: ids }, "Renaming");
      await db.$transaction(
        a.renames.map((r) =>
          db.document.update({ where: { id: r.documentId }, data: { name: r.name } })
        )
      );
      const renamed = a.renames
        .filter((r) => nameOf.get(r.documentId) !== r.name)
        .map((r) => ({ documentId: r.documentId, name: r.name, previousName: nameOf.get(r.documentId)! }));
      return {
        data: { renamed, unchanged: a.renames.length - renamed.length },
        audit: renamed.length
          ? `Renamed ${renamed.length} document(s): ${renamed.slice(0, 20).map((r) => `"${r.previousName}" -> "${r.name}"`).join("; ")}${renamed.length > 20 ? `; and ${renamed.length - 20} more` : ""}`
          : undefined,
      };
    },
  });

  defineTool(server, {
    name: "add_url_document",
    title: "Add a web address as a document",
    description:
      "Add a web address to the library as a document (not a sharing link: for those see create_sharing_link). It is listed like any file; opening it sends the visitor to the URL. Only public http and https addresses are accepted. Foyer does not fetch the URL.",
    scope: "write",
    input: {
      url: z.string().max(2000),
      name: nameField("Document name").optional().describe("Display name. Defaults to the address."),
      ...placement,
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const parsed = parseExternalUrl(a.url, a.name);
      if ("error" in parsed) throw new ToolError(parsed.error);
      const host = new URL(parsed.url).hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "");
      if (isIP(host) || !host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(host))
        throw new ToolError(
          "Use a public web address with a domain name. Numeric and internal network addresses are not accepted."
        );
      const room = await checkPlacement(p, v, a, "Adding a document to this room");
      const documentId = await db.$transaction((tx) =>
        place(tx, p, a, room, async (folderId) =>
          (
            await createExternalDocument(tx, {
              teamId: p.teamId,
              userId: p.userId,
              kind: "LINK",
              url: parsed.url,
              name: clean(parsed.name),
              folderId,
            })
          ).id
        )
      );
      return {
        data: { documentId, name: clean(parsed.name), type: "LINK", url: parsed.url, placed: placedOut(a, room) },
        audit: `Added web address "${clean(parsed.name)}" (${host}) to ${placedSummary(a, room?.name ?? null)}`,
      };
    },
  });

  defineTool(server, {
    name: "add_notion_document",
    title: "Add a Notion page as a document",
    description:
      "Add a published Notion page (an https notion.site or notion.so address) to the library as a live document. Visitors read the page inside Foyer and always see its current content.",
    scope: "write",
    input: {
      url: z.string().max(2000),
      name: nameField("Document name").optional().describe("Display name. Defaults to the page's title from its address."),
      ...placement,
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const parsed = parseNotionUrl(a.url);
      if ("error" in parsed) throw new ToolError(parsed.error);
      const name = a.name ?? (clean(parsed.name).slice(0, 200) || "Notion page");
      const room = await checkPlacement(p, v, a, "Adding a document to this room");
      const documentId = await db.$transaction((tx) =>
        place(tx, p, a, room, async (folderId) =>
          (
            await createExternalDocument(tx, {
              teamId: p.teamId,
              userId: p.userId,
              kind: "NOTION",
              url: parsed.url,
              name,
              folderId,
            })
          ).id
        )
      );
      return {
        data: { documentId, name, type: "NOTION", url: parsed.url, placed: placedOut(a, room) },
        audit: `Added Notion page "${name}" to ${placedSummary(a, room?.name ?? null)}`,
      };
    },
  });

  defineTool(server, {
    name: "create_text_document",
    title: "Write a text document",
    description:
      "Create a document from text you write, such as a README, an index or a summary, and optionally put it straight into a data room. Stored as a Markdown (.md) or plain text (.txt) file of up to 512 KB. To change it later use update_text_document. For files that already exist on disk use request_upload.",
    scope: "write",
    input: {
      name: nameField("Document name"),
      content: z.string().min(1).max(MAX_TEXT_BYTES),
      format: z.enum(["markdown", "text"]).default("markdown"),
      ...placement,
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const body = Buffer.from(a.content, "utf8");
      if (body.length > MAX_TEXT_BYTES)
        throw new ToolError(
          `The text is ${Math.round(body.length / 1024)} KB; the limit is ${MAX_TEXT_BYTES / 1024} KB.`
        );
      const room = await checkPlacement(p, v, a, "Adding a document to this room");
      const ext = a.format === "markdown" ? "md" : "txt";
      const fileName = `${a.name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120)}.${ext}`;
      const key = newFileKey(p.teamId, fileName);
      const contentType = contentTypeForFile(fileName);
      await putObject(key, body, contentType);
      let documentId: string;
      try {
        documentId = await db.$transaction((tx) =>
          place(tx, p, a, room, async (folderId) =>
            (
              await createFileDocument(tx, {
                teamId: p.teamId,
                userId: p.userId,
                key,
                fileName,
                name: a.name,
                size: body.length,
                contentType,
                numPages: null,
                folderId,
              })
            ).id
          )
        );
      } catch (e) {
        await deleteObject(key).catch(() => {});
        throw e;
      }
      return {
        data: {
          documentId,
          name: a.name,
          type: "TEXT",
          sizeBytes: body.length,
          placed: placedOut(a, room),
          url: `${appOrigin()}/documents/${documentId}`,
        },
        audit: `Wrote text document "${a.name}" (${body.length} bytes) to ${placedSummary(a, room?.name ?? null)}`,
      };
    },
  });

  defineTool(server, {
    name: "update_text_document",
    title: "Replace a text document's content",
    description:
      "Replace the whole content of a text document (one made with create_text_document, or any .md or .txt file) with new text. Saved as a new version; earlier versions are kept. Everywhere the document appears shows the new text at once. Read the current text first with get_document_text if you only mean to change part of it.",
    scope: "write",
    input: {
      documentId: id("document"),
      content: z.string().min(1).max(MAX_TEXT_BYTES),
      versionNote: z.string().max(500).optional(),
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const doc = await requireDoc(p, v, a.documentId, "edit");
      const fileName = doc.currentVersion?.fileName ?? "";
      if (doc.type !== "TEXT" || !/\.(md|txt)$/i.test(fileName))
        throw new ToolError(
          `"${doc.name}" is not a Markdown or plain text document, so its content cannot be replaced with text. To replace a file with a new file, use request_version_upload.`
        );
      const body = Buffer.from(a.content, "utf8");
      if (body.length > MAX_TEXT_BYTES)
        throw new ToolError(
          `The text is ${Math.round(body.length / 1024)} KB; the limit is ${MAX_TEXT_BYTES / 1024} KB.`
        );
      await requireShareForShared(p, { documentIds: [doc.id] }, "Replacing this document's content");
      const key = newFileKey(p.teamId, fileName);
      const contentType = contentTypeForFile(fileName);
      await putObject(key, body, contentType);
      let version: number;
      try {
        version = await db.$transaction(async (tx) => {
          const last = await tx.documentVersion.findFirst({
            where: { documentId: doc.id },
            orderBy: { versionNumber: "desc" },
          });
          const created = await tx.documentVersion.create({
            data: {
              documentId: doc.id,
              versionNumber: (last?.versionNumber ?? 0) + 1,
              fileKey: key,
              fileName,
              fileSize: body.length,
              contentType,
              uploadedById: p.userId,
              note: a.versionNote ? clean(a.versionNote) : null,
            },
          });
          await tx.document.update({
            where: { id: doc.id },
            data: { currentVersionId: created.id },
          });
          return created.versionNumber;
        });
      } catch (e) {
        await deleteObject(key).catch(() => {});
        throw e;
      }
      return {
        data: { documentId: doc.id, name: doc.name, version, sizeBytes: body.length },
        audit: `Replaced the text of "${doc.name}" (version ${version}, ${body.length} bytes)`,
      };
    },
  });

  // ---------- uploads ----------

  /** Old slots are of no use to anyone; clear them as new ones are made. */
  async function openSlots(
    p: ApiPrincipal,
    slots: {
      fileName: string;
      name: string | null;
      folderId: string | null;
      dataroomId: string | null;
      dataroomFolderId: string | null;
      documentId: string | null;
      note: string | null;
    }[]
  ) {
    await db.apiUpload.deleteMany({
      where: { teamId: p.teamId, expiresAt: { lt: new Date(Date.now() - 86_400_000) } },
    });
    const pending = await db.apiUpload.count({
      where: { userId: p.userId, teamId: p.teamId, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending + slots.length > 200)
      throw new ToolError(
        `There are already ${pending} unused upload commands open for this person. Use them, or wait 15 minutes for them to expire.`
      );
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS);
    const out: { fileName: string; command: string }[] = [];
    for (const s of slots) {
      const { secret, hashed } = newUploadSecret();
      const slot = await db.apiUpload.create({
        data: { ...s, teamId: p.teamId, tokenId: p.tokenId, userId: p.userId, hashedSecret: hashed, expiresAt },
      });
      out.push({
        fileName: s.fileName,
        // --fail-with-body: a refusal exits non-zero AND prints the server's
        // explanation, which says what to do next.
        command: `curl -sS --fail-with-body -X PUT -T "PATH_TO_FILE" -H "Authorization: Bearer ${secret}" "${appOrigin()}/api/upload/agent/${slot.id}"`,
      });
    }
    return { out, expiresAt };
  }

  function cleanFileName(raw: string) {
    const fileName = clean(raw).replace(/[\\/]/g, "-");
    if (!fileName || fileName === "." || fileName === "..")
      throw new ToolError('Give each file name with its extension, for example "deck.pdf".');
    if (!/\.[a-z0-9]{1,8}$/i.test(fileName) || /^\.[a-z0-9]+$/i.test(fileName))
      throw new ToolError(
        `"${fileName}" needs a name and an extension (for example "deck.pdf") so the document displays correctly.`
      );
    return fileName;
  }

  const HOW =
    'Run each command in a shell where the file is, replacing PATH_TO_FILE with that file\'s path (keep the quotes). Several commands can run one after another in one shell call. Each prints JSON: on success the documentId; on failure an "error" saying what to do. A command is only used up by a successful upload: if curl cannot open the file, fix the path and run the same command again.';

  defineTool(server, {
    name: "request_upload",
    title: "Get upload commands for files",
    description:
      "Add files from disk (PDF, Word, spreadsheet, image, video and so on): up to 50 per call. This tool does not take the files themselves. It returns one `curl` command per file; run each where the file is, replacing PATH_TO_FILE with the file's path. The command's output is the new document, with its documentId. Each command works once, within 15 minutes, for one file of up to 500 MB. Give dataroomId to put the files straight into a data room; the folders named are created now. To replace an existing document's file, use request_version_upload. If you cannot run shell commands, tell the user to upload in the Foyer web app instead.",
    scope: "write",
    input: {
      files: z
        .array(
          z.strictObject({
            fileName: z
              .string()
              .max(300)
              .describe('The file\'s name with its extension, for example "Q3 board deck.pdf". The extension decides how the document is displayed.'),
            name: nameField("Document name")
              .optional()
              .describe("Display name. Defaults to the file name without its extension; you can also fix names afterwards with rename_documents."),
            folderPath: libraryFolderPath,
            dataroomFolderPath: roomFolderPath,
          })
        )
        .min(1)
        .max(50),
      dataroomId: placement.dataroomId,
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const files = a.files.map((f) => ({ ...f, fileName: cleanFileName(f.fileName) }));
      let room = null;
      for (const f of files)
        room = await checkPlacement(
          p,
          v,
          { folderPath: f.folderPath, dataroomId: a.dataroomId, dataroomFolderPath: f.dataroomFolderPath },
          "Uploading into this room"
        );
      // Folders are made now, so each slot records ids and the upload itself
      // never has to interpret a path.
      const resolved = await db.$transaction(async (tx) => {
        if (files.some((f) => parsePath(f.folderPath).length)) await lockTree(tx, `lib:${p.teamId}`);
        if (room) await lockTree(tx, `room:${room.id}`);
        const out = [];
        for (const f of files)
          out.push({
            folderId: await resolveLibraryFolder(tx, p.teamId, { folderPath: f.folderPath }, { create: true }),
            dataroomFolderId: room
              ? await resolveRoomFolder(tx, room.id, { folderPath: f.dataroomFolderPath }, { create: true })
              : null,
          });
        return out;
      });
      const { out, expiresAt } = await openSlots(
        p,
        files.map((f, i) => ({
          fileName: f.fileName,
          name: f.name ?? null,
          folderId: resolved[i].folderId,
          dataroomId: room?.id ?? null,
          dataroomFolderId: resolved[i].dataroomFolderId,
          documentId: null,
          note: null,
        }))
      );
      return {
        data: {
          how: HOW,
          uploads: out.map((o, i) => ({
            ...o,
            destination: placedSummary(
              { folderPath: files[i].folderPath, dataroomFolderPath: files[i].dataroomFolderPath },
              room?.name ?? null
            ),
          })),
          expiresAt,
          maxBytesEach: MAX_UPLOAD_BYTES,
        },
        audit: `Opened ${out.length} upload command(s)${room ? ` into data room "${room.name}"` : ""}: ${files.slice(0, 10).map((f) => f.fileName).join(", ")}${files.length > 10 ? ` and ${files.length - 10} more` : ""}`,
      };
    },
  });

  defineTool(server, {
    name: "request_version_upload",
    title: "Get an upload command for a new version",
    description:
      "Replace an existing document's file with a newer one from disk, keeping its name, links, data room placements and view history. Returns one `curl` command, used the same way as request_upload's. The new file must be the same kind as the document (a PDF replaces a PDF). Everywhere the document appears shows the new version at once; earlier versions are kept.",
    scope: "write",
    input: {
      documentId: id("document"),
      fileName: z.string().max(300).describe('The new file\'s name with its extension, for example "Deck v4.pdf".'),
      versionNote: z.string().max(500).optional().describe("A short note on what changed, kept with the version."),
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const doc = await requireDoc(p, v, a.documentId, "edit");
      const fileName = cleanFileName(a.fileName);
      if (doc.type === "LINK" || doc.type === "NOTION")
        throw new ToolError(
          `"${doc.name}" is a ${doc.type === "LINK" ? "web address" : "Notion page"}, which has no file versions.`
        );
      const type = docTypeFromName(fileName);
      if (type !== doc.type)
        throw new ToolError(
          `"${doc.name}" is a ${doc.type} document and "${fileName}" is a ${type} file. A new version must be the same kind of file. To add this file as its own document, use request_upload.`
        );
      await requireShareForShared(p, { documentIds: [doc.id] }, "Replacing this document's file");
      const { out, expiresAt } = await openSlots(p, [
        {
          fileName,
          name: null,
          folderId: null,
          dataroomId: null,
          dataroomFolderId: null,
          documentId: doc.id,
          note: a.versionNote ? clean(a.versionNote) : null,
        },
      ]);
      return {
        data: {
          how: HOW.replace("on success the documentId", "on success the documentId and the new version number"),
          command: out[0].command,
          replaces: { documentId: doc.id, name: doc.name },
          expiresAt,
          maxBytes: MAX_UPLOAD_BYTES,
        },
        audit: `Opened an upload command for a new version of "${doc.name}" (${fileName})`,
      };
    },
  });
}
