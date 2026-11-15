import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bearerFrom, hasScope, resolveApiTokenId } from "@/lib/api-auth";
import { recordApiEvent } from "@/lib/api-audit";
import { canAccessDataroom } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { newFileKey, putObject, deleteObject } from "@/lib/storage";
import { docTypeFromName } from "@/lib/doc-types";
import { MAX_UPLOAD_BYTES, hashUploadSecret } from "@/lib/mcp/uploads";
import {
  countPdfPages,
  createFileDocument,
  placeInRoom,
  sniffMismatch,
  warmThumbnails,
} from "@/lib/mcp/documents";
import { appOrigin, limitKey, refreshApp } from "@/lib/mcp/context";
import { contentTypeForFile } from "@/lib/content-type";
import { liveLink, visibilityFor } from "@/lib/api-visibility";

export const maxDuration = 300;

/**
 * Receives one file for an upload slot opened by the MCP tool request_upload.
 *
 * The slot is the authority: it was created by an authenticated call and
 * already records where the file goes, so the request carries nothing but the
 * bytes and the slot's one-time secret. The secret travels in a header, not
 * the URL, so it does not end up in proxy or access logs. Every refusal says
 * what to do next, because the reader is usually an assistant looking at
 * curl's output.
 */

function refuse(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const AGAIN = "Call request_upload again for a fresh command.";

/**
 * Read the body, giving up as soon as it passes the limit. A request without
 * a Content-Length (chunked) would otherwise be buffered whole before its
 * size could be checked.
 */
async function readBounded(req: NextRequest, max: number): Promise<Buffer | "too-large"> {
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return "too-large";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Uploads hold a whole file in memory; cap how many one person runs at once.
const receiving = new Map<string, number>();
const MAX_AT_ONCE = 3;

async function receive(req: NextRequest, slotId: string) {
  const secret = bearerFrom(req);
  if (!secret || !secret.startsWith("fup_") || secret.length > 100)
    return refuse(
      401,
      "Missing upload token. Run the exact command request_upload returned, including its Authorization header."
    );
  // Look the slot up by the secret, then require the id to match: knowing a
  // slot id alone reveals nothing, and one answer covers every mismatch.
  const slot = await db.apiUpload.findUnique({
    where: { hashedSecret: hashUploadSecret(secret) },
  });
  if (!slot || slot.id !== slotId)
    return refuse(401, `This upload command is not valid. ${AGAIN}`);
  if (slot.usedAt)
    return refuse(
      409,
      `This upload command was already used${slot.resultDocumentId ? ` and produced document ${slot.resultDocumentId}` : ""}. Each command works once. ${AGAIN}`
    );
  if (slot.expiresAt <= new Date())
    return refuse(410, `This upload command has expired. ${AGAIN}`);

  const who = limitKey(slot);
  if (!rateLimit(`upload:${who}`, 200, 3_600_000).ok)
    return refuse(429, "Too many uploads in the last hour. Try again later.");
  if ((receiving.get(who) ?? 0) >= MAX_AT_ONCE)
    return refuse(429, "Several uploads are already in progress. Run this command again when they finish.");
  receiving.set(who, (receiving.get(who) ?? 0) + 1);
  try {
    return await store(req, slot);
  } finally {
    const left = (receiving.get(who) ?? 1) - 1;
    if (left <= 0) receiving.delete(who);
    else receiving.set(who, left);
  }
}

type Slot = NonNullable<Awaited<ReturnType<typeof db.apiUpload.findUnique>>>;

async function store(req: NextRequest, slot: Slot) {

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES)
    return refuse(413, `The file is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`);
  let body: Buffer;
  try {
    const read = await readBounded(req, MAX_UPLOAD_BYTES);
    if (read === "too-large")
      return refuse(413, `The file is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`);
    body = read;
  } catch {
    return refuse(400, "The upload was interrupted. Run the same command again.");
  }
  if (body.length === 0)
    return refuse(
      400,
      'No file content arrived. Check the path after -T points at the file, and that PATH_TO_FILE was replaced. Run the command again with the right path.'
    );
  if (declared > 0 && body.length !== declared)
    return refuse(
      400,
      `The upload was cut short: ${body.length} of ${declared} bytes arrived. Run the same command again.`
    );
  const mismatch = sniffMismatch(slot.fileName, body.subarray(0, 2048));
  if (mismatch) return refuse(415, `${mismatch} Nothing was stored. Check the file, then run the command again.`);

  // The key behind the slot must still be good for writing, and its owner
  // must still be allowed to do this, now that the bytes have arrived: a key
  // revoked or a person removed while a large file was in flight stops here.
  const principal = await resolveApiTokenId(slot.tokenId);
  if (!principal || principal.teamId !== slot.teamId || !hasScope(principal, "write"))
    return refuse(403, "The API key that opened this upload can no longer add documents.");
  const type = docTypeFromName(slot.fileName);

  // Resolve where it goes before spending the slot, so a room that vanished
  // or a permission that changed is reported while the command still works.
  let existing = null;
  if (slot.documentId) {
    existing = await db.document.findFirst({
      where: { id: slot.documentId, teamId: slot.teamId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!existing)
      return refuse(404, "The document this upload was a new version of no longer exists.");
    // Still theirs to change? The document may have moved out of the
    // member's reach since the command was issued.
    const v = await visibilityFor(principal);
    if (!(await db.document.findFirst({ where: { AND: [{ id: existing.id }, v.docEdit] }, select: { id: true } })))
      return refuse(403, "The API key that opened this upload may no longer change this document. Nothing was stored.");
    if (existing.type !== type)
      return refuse(415, `A new version must be the same kind of file as the document (${existing.type}); this file is ${type}. Nothing was stored.`);
    if (!hasScope(principal, "share")) {
      const shared = await db.link.count({
        where: {
          ...liveLink(),
          OR: [
            { documentId: existing.id },
            { dataroom: { documents: { some: { documentId: existing.id } } } },
          ],
        },
      });
      if (shared)
        return refuse(403, "This document is shared through an active link, and the API key may not change shared content. Nothing was stored.");
    }
  }
  if (slot.folderId) {
    const folder = await db.folder.findFirst({
      where: { id: slot.folderId, teamId: slot.teamId },
      select: { id: true },
    });
    if (!folder)
      return refuse(409, `The library folder this upload was for has been deleted. ${AGAIN}`);
  }
  let room = null;
  if (slot.dataroomId) {
    room = await db.dataroom.findFirst({
      where: { id: slot.dataroomId, teamId: slot.teamId },
    });
    if (!room || !(await canAccessDataroom(principal.ctx, room.id, "EDIT")))
      return refuse(403, `The data room this upload was for is no longer available to this API key. ${AGAIN}`);
    if (slot.dataroomFolderId) {
      const folder = await db.dataroomFolder.findFirst({
        where: { id: slot.dataroomFolderId, dataroomId: room.id },
        select: { id: true },
      });
      if (!folder)
        return refuse(409, `The folder this upload was for has been deleted from the data room. ${AGAIN}`);
    }
    if (
      !hasScope(principal, "share") &&
      (await db.link.count({ where: { dataroomId: room.id, ...liveLink() } }))
    )
      return refuse(403, "This data room is shared through an active link, and the API key may not add to shared rooms. Nothing was stored.");
  }

  // Spend the slot. Only one request can win this update, so two concurrent
  // uploads with the same command cannot both create a document.
  const claimed = await db.apiUpload.updateMany({
    where: { id: slot.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1)
    return refuse(409, `This upload command was already used. Each command works once. ${AGAIN}`);

  // Decided by the file's extension, never by what the client declares: the
  // file is later served from the app's own origin.
  const contentType = contentTypeForFile(slot.fileName);
  const key = newFileKey(slot.teamId, slot.fileName);
  // Counting pages parses the whole file in memory a second time; for very
  // large PDFs the count is left out rather than paid for.
  const numPages =
    type === "PDF" && body.length <= 60 * 1024 * 1024
      ? await countPdfPages(body)
      : null;

  let created = false;
  try {
    await putObject(key, body, contentType);
    const result = await db.$transaction(async (tx) => {
      if (existing) {
        const version = await tx.documentVersion.create({
          data: {
            documentId: existing.id,
            versionNumber: (existing.versions[0]?.versionNumber ?? 0) + 1,
            fileKey: key,
            fileName: slot.fileName,
            fileSize: body.length,
            contentType,
            numPages,
            uploadedById: slot.userId,
            note: slot.note,
          },
        });
        await tx.document.update({
          where: { id: existing.id },
          data: { currentVersionId: version.id, type },
        });
        return {
          id: existing.id,
          name: existing.name,
          versionId: version.id,
          version: version.versionNumber,
        };
      }
      const folderId = slot.folderId;
      const doc = await createFileDocument(tx, {
        teamId: slot.teamId,
        userId: slot.userId,
        key,
        fileName: slot.fileName,
        name: slot.name ?? (slot.fileName.replace(/\.[^.]+$/, "") || slot.fileName),
        size: body.length,
        contentType,
        numPages,
        folderId,
      });
      if (room) {
        await placeInRoom(tx, room.id, doc.id, slot.dataroomFolderId);
      }
      return { id: doc.id, name: doc.name, versionId: doc.currentVersionId, version: 1 };
    });

    created = true;
    // The document exists from here on. Nothing below may undo it.
    await db.apiUpload
      .update({ where: { id: slot.id }, data: { resultDocumentId: result.id } })
      .catch(() => {});
    warmThumbnails(type, result.versionId);
    await recordApiEvent(principal, {
      tool: "upload",
      summary: existing
        ? `Uploaded version ${result.version} of "${result.name}" (${slot.fileName}, ${body.length} bytes)`
        : `Uploaded "${result.name}" (${slot.fileName}, ${body.length} bytes)${room ? ` into data room "${room.name}"` : ""}`,
    });
    refreshApp();
    return NextResponse.json({
      ok: true,
      documentId: result.id,
      name: result.name,
      type,
      version: result.version,
      pages: numPages,
      sizeBytes: body.length,
      ...(room ? { dataroom: room.name } : {}),
      url: `${appOrigin()}/documents/${result.id}`,
    });
  } catch (e) {
    console.error("[upload/agent] failed", e);
    if (created)
      return refuse(500, "The file was stored, but the response could not be completed. Call list_documents to find it; do not upload it again.");
    // Do not leave an unreferenced object behind, and give the command back:
    // nothing was created, so trying again is safe.
    await deleteObject(key).catch(() => {});
    await db.apiUpload
      .update({ where: { id: slot.id }, data: { usedAt: null } })
      .catch(() => {});
    return refuse(500, "The file could not be stored. Run the same command again.");
  }
}

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  return receive(req, (await params).id);
}

export async function POST(req: NextRequest, { params }: Params) {
  return receive(req, (await params).id);
}
