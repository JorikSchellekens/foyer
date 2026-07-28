"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireRole, requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { seal, open as openSecret } from "@/lib/secret-box";
import { isTeamKey } from "@/lib/storage";
import { PapermarkClient, PapermarkError } from "@/lib/papermark/client";
import {
  PapermarkSessionClient,
  PapermarkSessionError,
  matchManualFiles,
} from "@/lib/papermark/files";
import { scanPapermark } from "@/lib/papermark/scan";
import type { ImportPlan } from "@/lib/papermark/scan";
import { materializeItems, runStep, type ImportOptions } from "@/lib/papermark/run";

/**
 * Server actions for the Papermark migration.
 *
 * Importing rewrites the team library, so every action here is owner/admin
 * only, and every one re-derives the team from the session rather than
 * trusting an id from the client.
 */

/** One already-uploaded file offered for matching. */
export type ManualUpload = {
  key: string;
  name: string;
  size: number;
  contentType: string;
  relativeDir?: string;
};

async function requireImport(importId: string) {
  const ctx = await requireTeam();
  const record = await db.import.findUnique({ where: { id: importId } });
  if (!record || record.teamId !== ctx.team.id) {
    throw new Error("Import not found");
  }
  return { ctx, record };
}

/** Validate the pasted credentials and open a draft import. */
export async function connectPapermark(input: {
  apiToken: string;
  sessionCookie?: string;
}): Promise<
  | { ok: true; importId: string; teams: { id: string; name: string }[] }
  | { ok: false; error: string; field?: "apiToken" | "sessionCookie" }
> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);

  const apiToken = input.apiToken.trim();
  if (!apiToken) return { ok: false, error: "Paste your Papermark API token.", field: "apiToken" };

  try {
    await new PapermarkClient(apiToken).verifyToken();
  } catch (e) {
    if (e instanceof PapermarkError) {
      return {
        ok: false,
        field: "apiToken",
        error: e.isAuth
          ? "Papermark rejected that API token. Check it was copied in full and has read scopes."
          : e.message,
      };
    }
    return { ok: false, field: "apiToken", error: "Could not reach the Papermark API." };
  }

  // The session cookie is optional: without it the user supplies files by
  // hand. If they did give one, fail fast here rather than mid-import.
  let teams: { id: string; name: string }[] = [];
  const cookie = input.sessionCookie?.trim();
  if (cookie) {
    try {
      teams = await new PapermarkSessionClient(cookie).listTeams();
      if (teams.length === 0) {
        return {
          ok: false,
          field: "sessionCookie",
          error: "That session has no Papermark teams.",
        };
      }
    } catch (e) {
      return {
        ok: false,
        field: "sessionCookie",
        error:
          e instanceof PapermarkSessionError
            ? e.message
            : "Could not use that session cookie.",
      };
    }
  }

  const record = await db.import.create({
    data: {
      teamId: ctx.team.id,
      createdById: ctx.user.id,
      source: "PAPERMARK",
      status: "DRAFT",
      tokenCipher: seal(apiToken),
      cookieCipher: cookie ? seal(cookie) : null,
      sourceTeamId: teams.length === 1 ? teams[0].id : null,
    },
  });

  revalidatePath("/settings/import");
  return { ok: true, importId: record.id, teams };
}

/** Record which Papermark team to pull files from, when there are several. */
export async function chooseSourceTeam(importId: string, sourceTeamId: string) {
  await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);
  await db.import.update({
    where: { id: record.id },
    data: { sourceTeamId },
  });
  revalidatePath("/settings/import");
}

/**
 * Read the source account.
 *
 * Started as a detached promise and polled by the client: a scan is
 * rate-limited to roughly 50 requests a minute, so a large account takes
 * longer than any request may run. The scan is read-only and idempotent, so if
 * the process restarts mid-scan the user simply runs it again.
 */
export async function startScan(importId: string) {
  await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);

  const token = openSecret(record.tokenCipher);
  if (!token) {
    return { ok: false as const, error: "The stored API token could not be read. Reconnect." };
  }

  await db.import.update({
    where: { id: record.id },
    data: {
      status: "SCANNING",
      activity: "Starting",
      error: null,
      heartbeatAt: new Date(),
    },
  });

  void (async () => {
    let lastWrite = 0;
    const client = new PapermarkClient(token, {
      onThrottle: () => {},
    });
    try {
      const plan = await scanPapermark(client, (stage, detail) => {
        // Throttle progress writes; the scan emits one per document.
        const now = Date.now();
        if (now - lastWrite < 700) return;
        lastWrite = now;
        void db.import
          .update({
            where: { id: record.id },
            data: {
              activity: detail ? `${stage} (${detail})` : stage,
              heartbeatAt: new Date(),
            },
          })
          .catch(() => {});
      });

      await db.import.update({
        where: { id: record.id },
        data: {
          status: "READY",
          plan: plan as unknown as Prisma.InputJsonValue,
          activity: null,
          heartbeatAt: new Date(),
        },
      });
    } catch (e) {
      await db.import
        .update({
          where: { id: record.id },
          data: {
            status: "FAILED",
            activity: null,
            error:
              e instanceof Error ? e.message.slice(0, 500) : "The scan failed.",
          },
        })
        .catch(() => {});
    }
  })();

  return { ok: true as const };
}

/** Poll target for the scan and the run. */
export async function getImportStatus(importId: string) {
  const { record } = await requireImport(importId);
  const plan = record.plan as unknown as ImportPlan | null;
  return {
    status: record.status,
    activity: record.activity,
    error: record.error,
    total: record.totalItems,
    done: record.doneItems,
    failed: record.failedItems,
    hasPlan: Boolean(plan),
    heartbeatAt: record.heartbeatAt?.toISOString() ?? null,
  };
}

/** Lock in the reviewed plan and build the work list. */
export async function confirmImport(importId: string, options: ImportOptions) {
  await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);

  const plan = record.plan as unknown as ImportPlan | null;
  if (!plan) return { ok: false as const, error: "Scan the account first." };

  if (options.fileStrategy === "session" && !record.sourceTeamId) {
    return {
      ok: false as const,
      error: "Choose which Papermark team the files come from.",
    };
  }
  if (options.fileStrategy === "session" && !openSecret(record.cookieCipher)) {
    return {
      ok: false as const,
      error:
        "Automatic file transfer needs a Papermark session cookie. Reconnect with one, or switch to supplying the files yourself.",
    };
  }

  await db.import.update({
    where: { id: record.id },
    data: {
      options: options as unknown as Prisma.InputJsonValue,
      status: "RUNNING",
      error: null,
    },
  });
  await materializeItems(record.id, plan, options);

  revalidatePath("/settings/import");
  return { ok: true as const };
}

/**
 * Advance the run by one bounded step. The client calls this in a loop; each
 * call returns after about twenty seconds of work.
 */
export async function stepImport(importId: string) {
  await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);
  try {
    const result = await runStep(record.id);
    if (result.status === "completed") revalidatePath("/settings/import");
    return { ok: true as const, ...result };
  } catch (e) {
    await db.import.update({
      where: { id: record.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message.slice(0, 500) : "The import failed.",
      },
    });
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "The import failed.",
    };
  }
}

export async function pauseImport(importId: string) {
  await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);
  if (record.status === "RUNNING") {
    await db.import.update({
      where: { id: record.id },
      data: { status: "PAUSED" },
    });
  }
  revalidatePath("/settings/import");
}

export async function resumeImport(importId: string) {
  await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);
  await db.import.update({
    where: { id: record.id },
    data: { status: "RUNNING", error: null },
  });
  revalidatePath("/settings/import");
}

/** Put failed items back in the queue so the run can pick them up again. */
export async function retryFailedItems(importId: string) {
  await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);
  const { count } = await db.importItem.updateMany({
    where: { importId: record.id, status: "FAILED" },
    data: { status: "PENDING", error: null, startedAt: null, completedAt: null },
  });
  await db.import.update({
    where: { id: record.id },
    data: {
      failedItems: { decrement: count },
      status: count > 0 ? "RUNNING" : record.status,
      error: null,
    },
  });
  revalidatePath("/settings/import");
  return { retried: count };
}

/**
 * Attach files the user uploaded themselves and match them to scanned
 * documents by name.
 *
 * Used by the manual file strategy. Returns the match result so the UI can
 * show what still has no file before anything is retried, rather than letting
 * the user discover it one failure at a time.
 */
export async function attachManualFiles(
  importId: string,
  files: ManualUpload[]
): Promise<
  | {
      ok: true;
      matched: number;
      unmatchedFiles: string[];
      unmatchedDocuments: { id: string; name: string }[];
    }
  | { ok: false; error: string }
> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);

  const plan = record.plan as unknown as ImportPlan | null;
  const options = record.options as unknown as ImportOptions | null;
  if (!plan || !options) return { ok: false, error: "Scan the account first." };

  // A key is only trusted if it lives under this team's storage prefix.
  const safe = files.filter((f) => isTeamKey(f.key, ctx.team.id));
  if (safe.length === 0) {
    return { ok: false, error: "No usable files were uploaded." };
  }

  const folderPath = new Map(plan.folders.map((f) => [f.id, f.path]));
  const targets = plan.documents
    .filter((d) => !d.external)
    .map((d) => ({
      id: d.id,
      name: d.fileName,
      folderPath: d.folderId ? (folderPath.get(d.folderId) ?? "") : "",
    }));

  const { matched, unmatchedFiles, unmatchedDocuments } = matchManualFiles(
    targets,
    safe.map((f) => ({
      key: f.key,
      name: f.name,
      size: f.size,
      contentType: f.contentType,
      relativeDir: f.relativeDir ?? "",
    }))
  );

  // Merge with anything attached in an earlier pass so the user can add files
  // in several goes without losing previous matches.
  const merged = { ...(options.manualFiles ?? {}) };
  for (const [docId, file] of matched) {
    merged[docId] = {
      key: file.key,
      name: file.name,
      size: file.size,
      contentType: file.contentType,
    };
  }

  await db.import.update({
    where: { id: record.id },
    data: {
      options: { ...options, manualFiles: merged } as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/settings/import");
  return {
    ok: true,
    matched: matched.size,
    unmatchedFiles: unmatchedFiles.map((f) => f.name),
    unmatchedDocuments: unmatchedDocuments.filter((d) => !merged[d.id]),
  };
}

/**
 * Hide a finished import from the dashboard while keeping the receipt.
 * Content is untouched - nothing references the Import row.
 */
export async function dismissImport(importId: string) {
  await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);
  await db.import.update({
    where: { id: record.id },
    data: { dismissedAt: new Date(), tokenCipher: null, cookieCipher: null },
  });
  revalidatePath("/settings/import");
}

/**
 * Erase the migration record entirely.
 *
 * Everything it created stays exactly where it is as ordinary Foyer content -
 * no document, link or dataroom carries an import id, so deleting the receipt
 * leaves no orphan and breaks nothing.
 */
export async function deleteImport(importId: string) {
  await requireRole(["OWNER", "ADMIN"]);
  const { record } = await requireImport(importId);
  await db.import.delete({ where: { id: record.id } });
  revalidatePath("/settings/import");
}

/**
 * Dissolve the wrapper folder an import created, lifting its contents to the
 * library root. The tidy-up affordance for people who chose `wrap`, decided
 * the extra level was noise, and want it gone without dragging every item.
 */
export async function dissolveWrapperFolder(importId: string) {
  await requireRole(["OWNER", "ADMIN"]);
  const { ctx, record } = await requireImport(importId);
  if (!record.rootFolderId) {
    return { ok: false as const, error: "This import did not create a folder." };
  }

  const folder = await db.folder.findUnique({
    where: { id: record.rootFolderId },
    select: { id: true, teamId: true, parentId: true },
  });
  if (!folder || folder.teamId !== ctx.team.id) {
    return { ok: false as const, error: "That folder no longer exists." };
  }

  await db.$transaction([
    db.folder.updateMany({
      where: { teamId: ctx.team.id, parentId: folder.id },
      data: { parentId: folder.parentId },
    }),
    db.document.updateMany({
      where: { teamId: ctx.team.id, folderId: folder.id },
      data: { folderId: folder.parentId },
    }),
    db.folder.delete({ where: { id: folder.id } }),
    db.import.update({
      where: { id: record.id },
      data: { rootFolderId: null },
    }),
  ]);

  revalidatePath("/settings/import");
  revalidatePath("/documents");
  return { ok: true as const };
}
