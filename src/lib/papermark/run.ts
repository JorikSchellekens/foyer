import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { docTypeFromName } from "@/lib/doc-types";
import { getObjectBuffer, newFileKey, putObject } from "@/lib/storage";
import { generateSlug } from "@/lib/slug";
import { hashPassword } from "@/lib/tokens";
import { generateVersionThumbnails } from "@/lib/thumbnails";
import { open as openSecret } from "@/lib/secret-box";
import { PapermarkSessionClient } from "./files";
import type { ImportPlan } from "./scan";

/**
 * Executes an import plan, one bounded step at a time.
 *
 * Foyer has no job queue, and a large migration is far too long for a single
 * request. Rather than bolt on infrastructure, a run is a sequence of short
 * steps: each call processes items until a time budget expires, then returns
 * progress. The client loops. That gives three things for free - live progress
 * without polling a separate status store, a run that survives a deploy or a
 * closed laptop (reopen the page and it picks up), and no risk of a request
 * timeout killing a half-finished import.
 *
 * Every item is idempotent via ImportItem: an item already DONE is never
 * redone, so resuming can only ever move forward.
 */

/** Leaves comfortable headroom under the 300s route limit. */
const STEP_BUDGET_MS = 20_000;

export type ImportOptions = {
  /** Which sections to bring over. */
  include: {
    documents: boolean;
    datarooms: boolean;
    links: boolean;
    visitors: boolean;
  };
  /**
   * Where imported library content lands. `wrap` puts everything inside one
   * new folder (reversible, tidy); `merge` recreates Papermark's tree at the
   * library root.
   */
  placement: "wrap" | "merge";
  /** Folder name used when placement is `wrap`. */
  wrapFolderName: string;
  fileStrategy: "session" | "manual";
  /** Per-link password chosen by the user for links that had one. */
  linkPasswords?: Record<string, string>;
  /** Papermark link ids the user chose not to import. */
  skipLinkIds?: string[];
  /** Map of Papermark document id -> already-uploaded storage key (manual mode). */
  manualFiles?: Record<string, { key: string; name: string; size: number; contentType: string }>;
};

export type StepResult = {
  status: "running" | "completed" | "failed";
  total: number;
  done: number;
  failed: number;
  /** Human-readable description of what the step was doing when it stopped. */
  current: string | null;
};

type Ctx = {
  importId: string;
  teamId: string;
  userId: string | null;
  plan: ImportPlan;
  options: ImportOptions;
  session: PapermarkSessionClient | null;
  sourceTeamId: string | null;
  /** externalId -> local id, for the current step. Rebuilt per step from db. */
  ids: Map<string, string>;
};

function key(kind: string, externalId: string) {
  return `${kind}:${externalId}`;
}

// ------------------------------------------------------------------ planning

/**
 * Turn a reviewed plan into the ordered work list.
 *
 * Order matters and is encoded in sortOrder rather than in control flow, so a
 * resumed run reconstructs the same sequence without replaying any logic:
 * containers before their contents, everything before the links that point at
 * it.
 */
export async function materializeItems(
  importId: string,
  plan: ImportPlan,
  options: ImportOptions
) {
  const rows: Prisma.ImportItemCreateManyInput[] = [];

  if (options.include.documents) {
    // Shallower folders first so a parent always exists before its child.
    const depth = (f: { path: string }) => f.path.split("/").filter(Boolean).length;
    for (const f of [...plan.folders].sort((a, b) => depth(a) - depth(b))) {
      rows.push({
        importId,
        kind: "FOLDER",
        externalId: f.id,
        externalName: f.name,
        sortOrder: 100 + depth(f),
      });
    }
    for (const d of plan.documents) {
      rows.push({
        importId,
        kind: "DOCUMENT",
        externalId: d.id,
        externalName: d.name,
        sortOrder: 200,
      });
    }
  }

  if (options.include.datarooms) {
    for (const dr of plan.datarooms) {
      rows.push({
        importId,
        kind: "DATAROOM",
        externalId: dr.id,
        externalName: dr.name,
        sortOrder: 300,
      });
      const byId = new Map(dr.folders.map((f) => [f.id, f]));
      const fdepth = (f: { parentId: string | null }): number => {
        let n = 0;
        let cur = f.parentId;
        while (cur && n < 50) {
          n++;
          cur = byId.get(cur)?.parentId ?? null;
        }
        return n;
      };
      for (const f of [...dr.folders].sort((a, b) => fdepth(a) - fdepth(b))) {
        rows.push({
          importId,
          kind: "DATAROOM_FOLDER",
          externalId: `${dr.id}:${f.id}`,
          externalName: f.name,
          sortOrder: 400 + fdepth(f),
        });
      }
      for (const d of dr.documents) {
        rows.push({
          importId,
          kind: "DATAROOM_DOCUMENT",
          externalId: `${dr.id}:${d.documentId}`,
          externalName: d.name,
          sortOrder: 500,
        });
      }
    }
  }

  if (options.include.links) {
    const skip = new Set(options.skipLinkIds ?? []);
    // Domains must be verified-or-at-least-registered before a link can claim
    // a slug on them.
    for (const dom of plan.domains) {
      rows.push({
        importId,
        kind: "DOMAIN",
        externalId: dom.domain,
        externalName: dom.domain,
        sortOrder: 50,
      });
    }
    for (const l of plan.links) {
      if (skip.has(l.id)) continue;
      rows.push({
        importId,
        kind: "LINK",
        externalId: l.id,
        externalName: l.name,
        sortOrder: 600,
        caveats: l.caveats as unknown as Prisma.InputJsonValue,
      });
    }
  }

  if (options.include.visitors) {
    for (const v of plan.visitors) {
      rows.push({
        importId,
        kind: "VISITOR",
        externalId: v.id,
        externalName: v.email,
        sortOrder: 700,
      });
    }
  }

  await db.importItem.createMany({ data: rows, skipDuplicates: true });
  await db.import.update({
    where: { id: importId },
    data: { totalItems: rows.length, doneItems: 0, failedItems: 0 },
  });
  return rows.length;
}

// ------------------------------------------------------------------- running

export async function runStep(importId: string): Promise<StepResult> {
  const record = await db.import.findUnique({ where: { id: importId } });
  if (!record) throw new Error("Import not found");
  if (record.status === "COMPLETED")
    return summarize(record.totalItems, record.doneItems, record.failedItems, "completed");

  const plan = record.plan as unknown as ImportPlan | null;
  const options = record.options as unknown as ImportOptions | null;
  if (!plan || !options) throw new Error("Import has no reviewed plan");

  const cookie = openSecret(record.cookieCipher);
  const ctx: Ctx = {
    importId,
    teamId: record.teamId,
    userId: record.createdById,
    plan,
    options,
    session:
      options.fileStrategy === "session" && cookie
        ? new PapermarkSessionClient(cookie)
        : null,
    sourceTeamId: record.sourceTeamId,
    ids: new Map(),
  };

  // Rebuild the external->local map from everything already imported, so a
  // resumed run can resolve parents it created in an earlier step.
  for (const done of await db.importItem.findMany({
    where: { importId, status: "DONE", localId: { not: null } },
    select: { kind: true, externalId: true, localId: true },
  })) {
    ctx.ids.set(key(done.kind, done.externalId), done.localId!);
  }

  await db.import.update({
    where: { id: importId },
    data: {
      status: "RUNNING",
      heartbeatAt: new Date(),
      startedAt: record.startedAt ?? new Date(),
    },
  });

  const deadline = Date.now() + STEP_BUDGET_MS;
  let current: string | null = null;

  while (Date.now() < deadline) {
    const item = await db.importItem.findFirst({
      where: { importId, status: "PENDING" },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    if (!item) break;

    current = `${item.kind.toLowerCase().replace(/_/g, " ")}: ${item.externalName}`;
    await db.importItem.update({
      where: { id: item.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    try {
      const localId = await performItem(ctx, item.kind, item.externalId, item.externalName);
      await db.importItem.update({
        where: { id: item.id },
        data: {
          status: localId === null ? "SKIPPED" : "DONE",
          localId: localId ?? undefined,
          completedAt: new Date(),
        },
      });
      if (localId) ctx.ids.set(key(item.kind, item.externalId), localId);
      await db.import.update({
        where: { id: importId },
        data: { doneItems: { increment: 1 }, heartbeatAt: new Date() },
      });
    } catch (e) {
      // One bad document must not abort a 400-document migration. The failure
      // is recorded against the item and the run continues; the review screen
      // lists every failure and offers a retry.
      await db.importItem.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          error: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
          completedAt: new Date(),
        },
      });
      await db.import.update({
        where: { id: importId },
        data: { failedItems: { increment: 1 }, heartbeatAt: new Date() },
      });
    }
  }

  const remaining = await db.importItem.count({
    where: { importId, status: { in: ["PENDING", "RUNNING"] } },
  });
  const fresh = await db.import.findUniqueOrThrow({ where: { id: importId } });

  if (remaining === 0) {
    await db.import.update({
      where: { id: importId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        // The migration is over; the borrowed credentials are no longer needed.
        tokenCipher: null,
        cookieCipher: null,
      },
    });
    return summarize(fresh.totalItems, fresh.doneItems, fresh.failedItems, "completed");
  }

  return summarize(fresh.totalItems, fresh.doneItems, fresh.failedItems, "running", current);
}

function summarize(
  total: number,
  done: number,
  failed: number,
  status: StepResult["status"],
  current: string | null = null
): StepResult {
  return { status, total, done, failed, current };
}

// -------------------------------------------------------------- item handlers

async function performItem(
  ctx: Ctx,
  kind: string,
  externalId: string,
  externalName: string
): Promise<string | null> {
  switch (kind) {
    case "DOMAIN":
      return importDomain(ctx, externalId);
    case "FOLDER":
      return importFolder(ctx, externalId);
    case "DOCUMENT":
      return importDocument(ctx, externalId);
    case "DATAROOM":
      return importDataroom(ctx, externalId);
    case "DATAROOM_FOLDER":
      return importDataroomFolder(ctx, externalId);
    case "DATAROOM_DOCUMENT":
      return importDataroomDocument(ctx, externalId);
    case "LINK":
      return importLink(ctx, externalId);
    case "VISITOR":
      return importVisitor(ctx, externalId, externalName);
    default:
      return null;
  }
}

/**
 * Register the custom domain so links can claim their original slugs.
 *
 * Verification is intentionally not attempted here: DNS still points at
 * Papermark at this moment, so a check would fail and mark the domain ERROR.
 * The domain is created PENDING and the cutover screen walks the user through
 * re-pointing DNS and verifying when they are ready.
 */
async function importDomain(ctx: Ctx, domain: string): Promise<string> {
  const existing = await db.domain.findUnique({ where: { domain } });
  if (existing) {
    if (existing.teamId !== ctx.teamId) {
      throw new Error(
        `${domain} is already connected to a different team in Foyer.`
      );
    }
    return existing.id;
  }
  const created = await db.domain.create({
    data: { teamId: ctx.teamId, domain, status: "PENDING" },
  });
  return created.id;
}

async function rootFolderId(ctx: Ctx): Promise<string | null> {
  if (ctx.options.placement !== "wrap") return null;
  const record = await db.import.findUniqueOrThrow({
    where: { id: ctx.importId },
    select: { rootFolderId: true },
  });
  if (record.rootFolderId) return record.rootFolderId;
  const folder = await db.folder.create({
    data: {
      teamId: ctx.teamId,
      parentId: null,
      name: ctx.options.wrapFolderName || "Papermark import",
    },
  });
  await db.import.update({
    where: { id: ctx.importId },
    data: { rootFolderId: folder.id },
  });
  return folder.id;
}

async function importFolder(ctx: Ctx, externalId: string): Promise<string> {
  const planned = ctx.plan.folders.find((f) => f.id === externalId);
  if (!planned) throw new Error("Folder is no longer in the scanned plan");

  const parentId = planned.parentId
    ? (ctx.ids.get(key("FOLDER", planned.parentId)) ?? (await rootFolderId(ctx)))
    : await rootFolderId(ctx);

  const existing = await db.folder.findFirst({
    where: { teamId: ctx.teamId, parentId, name: planned.name },
  });
  if (existing) return existing.id;

  const created = await db.folder.create({
    data: { teamId: ctx.teamId, parentId, name: planned.name },
  });
  return created.id;
}

async function importDocument(ctx: Ctx, externalId: string): Promise<string> {
  const planned = ctx.plan.documents.find((d) => d.id === externalId);
  if (!planned) throw new Error("Document is no longer in the scanned plan");

  const folderId = planned.folderId
    ? (ctx.ids.get(key("FOLDER", planned.folderId)) ?? (await rootFolderId(ctx)))
    : await rootFolderId(ctx);

  // Notion and external-link documents have no bytes; Foyer models them the
  // same way, as a document carrying an external URL.
  if (planned.external) {
    const doc = await db.document.create({
      data: {
        teamId: ctx.teamId,
        folderId,
        name: planned.name,
        type: planned.type === "notion" ? "NOTION" : "OTHER",
        externalUrl: planned.externalUrl,
      },
    });
    return doc.id;
  }

  let body: Buffer;
  let fileName = planned.fileName;
  let contentType = planned.contentType ?? "application/octet-stream";

  if (ctx.options.fileStrategy === "manual") {
    const supplied = ctx.options.manualFiles?.[externalId];
    if (!supplied) {
      throw new Error(
        "No matching file was supplied for this document. Add it on the files step and retry."
      );
    }
    body = await getObjectBuffer(supplied.key);
    fileName = supplied.name;
    contentType = supplied.contentType || contentType;
  } else {
    if (!ctx.session || !ctx.sourceTeamId) {
      throw new Error("The Papermark session is no longer available.");
    }
    const fetched = await ctx.session.downloadDocument(
      ctx.sourceTeamId,
      externalId
    );
    body = fetched.body;
    fileName = fetched.fileName || fileName;
    contentType = fetched.contentType || contentType;
  }

  const storageKey = newFileKey(ctx.teamId, fileName);
  await putObject(storageKey, body, contentType);

  const doc = await db.document.create({
    data: {
      teamId: ctx.teamId,
      folderId,
      name: planned.name,
      type: docTypeFromName(fileName),
      versions: {
        create: {
          versionNumber: 1,
          fileKey: storageKey,
          fileName,
          fileSize: body.byteLength,
          contentType,
          numPages: planned.numPages,
          uploadedById: ctx.userId,
          note: "Imported from Papermark",
        },
      },
    },
    include: { versions: true },
  });

  const version = doc.versions[0];
  await db.document.update({
    where: { id: doc.id },
    data: { currentVersionId: version.id },
  });

  // Same fire-and-forget warm-up the normal upload path uses; thumbnails are
  // regenerated lazily on first view if this does not finish.
  void generateVersionThumbnails(version.id).catch(() => {});

  return doc.id;
}

async function importDataroom(ctx: Ctx, externalId: string): Promise<string> {
  const planned = ctx.plan.datarooms.find((d) => d.id === externalId);
  if (!planned) throw new Error("Dataroom is no longer in the scanned plan");
  const created = await db.dataroom.create({
    data: {
      teamId: ctx.teamId,
      name: planned.name,
      description: planned.description,
    },
  });
  return created.id;
}

function splitDataroomKey(externalId: string) {
  const idx = externalId.indexOf(":");
  return {
    dataroomExternalId: externalId.slice(0, idx),
    childExternalId: externalId.slice(idx + 1),
  };
}

async function importDataroomFolder(ctx: Ctx, externalId: string): Promise<string> {
  const { dataroomExternalId, childExternalId } = splitDataroomKey(externalId);
  const dataroomId = ctx.ids.get(key("DATAROOM", dataroomExternalId));
  if (!dataroomId) throw new Error("Its dataroom was not imported");

  const dr = ctx.plan.datarooms.find((d) => d.id === dataroomExternalId);
  const planned = dr?.folders.find((f) => f.id === childExternalId);
  if (!planned) throw new Error("Folder is no longer in the scanned plan");

  const parentId = planned.parentId
    ? (ctx.ids.get(
        key("DATAROOM_FOLDER", `${dataroomExternalId}:${planned.parentId}`)
      ) ?? null)
    : null;

  const created = await db.dataroomFolder.create({
    data: {
      dataroomId,
      parentId,
      name: planned.name,
      orderIndex: planned.orderIndex,
    },
  });
  return created.id;
}

async function importDataroomDocument(ctx: Ctx, externalId: string): Promise<string | null> {
  const { dataroomExternalId, childExternalId } = splitDataroomKey(externalId);
  const dataroomId = ctx.ids.get(key("DATAROOM", dataroomExternalId));
  if (!dataroomId) throw new Error("Its dataroom was not imported");

  const documentId = ctx.ids.get(key("DOCUMENT", childExternalId));
  if (!documentId) {
    // The dataroom references a library document that was not imported (the
    // user deselected documents, or that one failed). Skip rather than fail.
    return null;
  }

  const dr = ctx.plan.datarooms.find((d) => d.id === dataroomExternalId);
  const planned = dr?.documents.find((d) => d.documentId === childExternalId);

  const folderId = planned?.folderId
    ? (ctx.ids.get(
        key("DATAROOM_FOLDER", `${dataroomExternalId}:${planned.folderId}`)
      ) ?? null)
    : null;

  const created = await db.dataroomDocument.upsert({
    where: { dataroomId_documentId: { dataroomId, documentId } },
    create: {
      dataroomId,
      documentId,
      folderId,
      orderIndex: planned?.orderIndex ?? 0,
    },
    update: { folderId, orderIndex: planned?.orderIndex ?? 0 },
  });
  return created.id;
}

async function importLink(ctx: Ctx, externalId: string): Promise<string | null> {
  const planned = ctx.plan.links.find((l) => l.id === externalId);
  if (!planned) throw new Error("Link is no longer in the scanned plan");

  const documentId = planned.documentId
    ? (ctx.ids.get(key("DOCUMENT", planned.documentId)) ?? null)
    : null;
  const dataroomId = planned.dataroomId
    ? (ctx.ids.get(key("DATAROOM", planned.dataroomId)) ?? null)
    : null;

  if (planned.targetType === "document" && !documentId) return null;
  if (planned.targetType === "dataroom" && !dataroomId) return null;

  const domainId = planned.domain
    ? (ctx.ids.get(key("DOMAIN", planned.domain)) ?? null)
    : null;

  // Settings were resolved once at scan time and shown to the user; write
  // exactly those rather than re-deriving them here.
  const settings = planned.settings;

  const password = ctx.options.linkPasswords?.[planned.id];
  const slug = await claimSlug(planned.slug, domainId);

  const created = await db.link.create({
    data: {
      teamId: ctx.teamId,
      target: planned.targetType === "dataroom" ? "DATAROOM" : "DOCUMENT",
      documentId,
      dataroomId,
      name: planned.name,
      slug,
      domainId,
      accessMode: settings.accessMode,
      passwordHash: password ? hashPassword(password) : null,
      expiresAt: settings.expiresAt,
      allowDownload: settings.allowDownload,
      allowList: settings.allowList,
      blockList: settings.blockList,
      screenshotProtection: settings.screenshotProtection,
      watermark: settings.watermark,
      notifyOnAccess: settings.notifyOnAccess,
      welcomeMessage: settings.welcomeMessage,
      fullAccess: planned.permissions.length === 0,
    },
  });

  if (planned.permissions.length > 0) {
    // Grants reference dataroom items by Papermark id; translate each through
    // the id map and drop any that were not imported.
    const dr = ctx.plan.datarooms.find((d) => d.id === planned.dataroomId);

    const rows = planned.permissions
      .map((p) => {
        let localId: string | undefined;
        if (p.itemType === "dataroom_folder") {
          localId = ctx.ids.get(
            key("DATAROOM_FOLDER", `${planned.dataroomId}:${p.itemId}`)
          );
        } else {
          // Papermark identifies a dataroom document either by the underlying
          // document id or by the join row's own id depending on the call.
          // Accept both rather than betting on one and silently dropping
          // grants - a lost grant would widen access, not narrow it.
          const byDocument = dr?.documents.find(
            (d) => d.documentId === p.itemId
          );
          const byJoinRow = dr?.documents.find((d) => d.id === p.itemId);
          const sourceDocumentId = (byDocument ?? byJoinRow)?.documentId;
          if (sourceDocumentId) {
            localId = ctx.ids.get(
              key("DATAROOM_DOCUMENT", `${planned.dataroomId}:${sourceDocumentId}`)
            );
          }
        }
        if (!localId) return null;
        return {
          linkId: created.id,
          itemType:
            p.itemType === "dataroom_folder"
              ? ("DATAROOM_FOLDER" as const)
              : ("DATAROOM_DOCUMENT" as const),
          itemId: localId,
          canView: p.canView,
          canDownload: p.canDownload,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
      await db.linkPermission.createMany({ data: rows, skipDuplicates: true });
    }
  }

  return created.id;
}

/**
 * Take the source slug when it is free, so a re-pointed custom domain serves
 * the identical URL. If something already holds it, fall back to a generated
 * slug rather than failing the link or stealing an existing one.
 */
async function claimSlug(preferred: string, domainId: string | null) {
  const candidate = preferred || generateSlug();
  const clash = await db.link.findFirst({
    where: { slug: candidate, domainId },
    select: { id: true },
  });
  return clash ? generateSlug() : candidate;
}

async function importVisitor(
  ctx: Ctx,
  _externalId: string,
  email: string
): Promise<string> {
  const planned = ctx.plan.visitors.find((v) => v.id === _externalId);
  const normalized = (planned?.email ?? email).toLowerCase().trim();
  const viewer = await db.viewer.upsert({
    where: { teamId_email: { teamId: ctx.teamId, email: normalized } },
    create: {
      teamId: ctx.teamId,
      email: normalized,
      verified: planned?.verified ?? false,
    },
    update: {},
  });
  return viewer.id;
}
