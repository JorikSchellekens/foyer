import "server-only";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/tokens";
import { getObjectBuffer, newFileKey, putObject } from "@/lib/storage";
import {
  sendSignatureInvite,
  sendSignatureReminder,
  sendSignatureCompleted,
} from "@/lib/email";
import { notifyTeam, dispatchWebhooks } from "@/lib/notify";
import {
  stampFields,
  appendCertificate,
  sealPdf,
  sha256Hex,
  type StampPlacement,
} from "@/lib/stamp";
import type { Prisma, Signer } from "@prisma/client";

// Lifecycle engine for signature requests. Every transition writes an
// append-only SigningEvent row; the trail becomes the certificate page.

export async function logEvent(
  requestId: string,
  type: string,
  opts: {
    signerId?: string | null;
    meta?: Record<string, unknown>;
    ip?: string | null;
    userAgent?: string | null;
  } = {}
) {
  await db.signingEvent.create({
    data: {
      requestId,
      type,
      signerId: opts.signerId ?? null,
      meta: (opts.meta as Prisma.InputJsonValue) ?? undefined,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });
}

const requestInclude = {
  document: true,
  version: true,
  team: true,
  signers: { orderBy: [{ order: "asc" as const }, { email: "asc" as const }] },
  fields: true,
} satisfies Prisma.SignatureRequestInclude;

export type FullRequest = Prisma.SignatureRequestGetPayload<{
  include: typeof requestInclude;
}>;

export async function getFullRequest(id: string): Promise<FullRequest | null> {
  return db.signatureRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
}

function activeSigners(req: FullRequest): Signer[] {
  return req.signers.filter((s) => s.role === "SIGNER");
}

/** The routing round currently being signed (lowest order not fully signed). */
function currentRound(req: FullRequest): number {
  const pending = activeSigners(req).filter((s) => s.status !== "SIGNED");
  return pending.length ? Math.min(...pending.map((s) => s.order)) : -1;
}

/** Signers whose turn it is now: everyone in parallel, the round when serial. */
export function signersUpNow(req: FullRequest): Signer[] {
  const active = activeSigners(req);
  if (!req.sequential) return active.filter((s) => s.status !== "SIGNED");
  const round = currentRound(req);
  return active.filter((s) => s.order === round && s.status !== "SIGNED");
}

async function emailSigners(
  req: FullRequest,
  signers: Signer[],
  origin: string
) {
  const now = new Date();
  await Promise.allSettled(
    signers.map((s) =>
      sendSignatureInvite({
        email: s.email,
        url: `${origin}/sign/t/${s.token}`,
        documentName: req.title,
        teamName: req.team.name,
        message: req.message,
        expiresAt: req.expiresAt,
      })
    )
  );
  await db.signer.updateMany({
    where: { id: { in: signers.map((s) => s.id) } },
    data: { status: "SENT", lastSentAt: now },
  });
  for (const s of signers)
    await logEvent(req.id, "sent", { signerId: s.id, meta: { email: s.email } });
}

export async function sendRequest(
  requestId: string,
  origin: string
): Promise<{ ok: true } | { error: string }> {
  const req = await getFullRequest(requestId);
  if (!req || req.status !== "DRAFT") return { error: "Request unavailable." };
  const signers = activeSigners(req);
  if (signers.length === 0) return { error: "Add at least one signer." };
  for (const s of signers) {
    if (!req.fields.some((f) => f.signerId === s.id && f.kind === "SIGNATURE"))
      return { error: `Place a signature field for ${s.email}.` };
  }
  if (!req.version.fileKey) return { error: "Document file is missing." };

  // Mint fresh tokens at send time so drafts never leak usable links.
  for (const s of req.signers) {
    const token = randomToken();
    await db.signer.update({ where: { id: s.id }, data: { token } });
    s.token = token;
  }

  await db.signatureRequest.update({
    where: { id: req.id },
    data: { status: "SENT", sentAt: new Date() },
  });
  await emailSigners(req, signersUpNow(req), origin);
  await dispatchWebhooks(req.teamId, "signature.sent", {
    requestId: req.id,
    title: req.title,
    documentId: req.documentId,
    signers: signers.map((s) => s.email),
  });
  return { ok: true };
}

/** First open of the signing page: SENT -> VIEWED plus an audit event. */
export async function recordSignerView(
  signerId: string,
  ip: string | null,
  userAgent: string | null
) {
  const signer = await db.signer.findUnique({ where: { id: signerId } });
  if (!signer || signer.status === "SIGNED" || signer.status === "DECLINED")
    return;
  await db.signer.update({
    where: { id: signerId },
    data: {
      status: "VIEWED",
      ...(signer.viewedAt ? {} : { viewedAt: new Date(), ip, userAgent }),
    },
  });
  if (!signer.viewedAt)
    await logEvent(signer.requestId, "viewed", { signerId, ip, userAgent });
}

export async function completeSigner(
  signerId: string,
  input: {
    name?: string | null;
    signatureData?: string | null;
    initialsData?: string | null;
    values: Record<string, string>; // fieldId -> value
  },
  ip: string | null,
  userAgent: string | null,
  origin: string
): Promise<{ ok: true } | { error: string }> {
  const signer = await db.signer.findUnique({
    where: { id: signerId },
    include: { fields: true, request: true },
  });
  if (!signer || signer.request.status !== "SENT")
    return { error: "This request is no longer open." };
  if (signer.status === "SIGNED") return { error: "You have already signed." };

  const needsSignature = signer.fields.some((f) => f.kind === "SIGNATURE");
  const needsInitials = signer.fields.some((f) => f.kind === "INITIALS");
  if (needsSignature && !input.signatureData)
    return { error: "Adopt a signature to finish." };
  if (needsInitials && !input.initialsData)
    return { error: "Adopt your initials to finish." };
  for (const f of signer.fields) {
    if (f.kind === "TEXT" && f.required && !(input.values[f.id] ?? "").trim())
      return { error: "Fill in all required fields to finish." };
  }

  const now = new Date();
  await db.$transaction([
    ...signer.fields.map((f) =>
      db.signatureField.update({
        where: { id: f.id },
        data: {
          value:
            f.kind === "DATE_SIGNED"
              ? now.toISOString().slice(0, 10)
              : f.kind === "TEXT" || f.kind === "CHECKBOX"
                ? (input.values[f.id] ?? null)
                : null,
          filledAt: now,
        },
      })
    ),
    db.signer.update({
      where: { id: signer.id },
      data: {
        status: "SIGNED",
        signedAt: now,
        name: input.name?.trim() || signer.name,
        signatureData: input.signatureData ?? null,
        initialsData: input.initialsData ?? null,
        ip,
        userAgent,
      },
    }),
  ]);
  await logEvent(signer.requestId, "consented", { signerId, ip, userAgent });
  await logEvent(signer.requestId, "signed", {
    signerId,
    ip,
    userAgent,
    meta: { email: signer.email },
  });

  const req = (await getFullRequest(signer.requestId))!;
  await notifyTeam(req.teamId, "signature_signed", {
    who: signer.name ?? signer.email,
    itemName: req.title,
    detail: `${activeSigners(req).filter((s) => s.status === "SIGNED").length} of ${activeSigners(req).length} signed`,
    href: `/signatures/${req.id}`,
  });
  await advance(req, origin);
  return { ok: true };
}

/** After each signature: email the next round, or finish the envelope. */
async function advance(req: FullRequest, origin: string) {
  const remaining = activeSigners(req).filter((s) => s.status !== "SIGNED");
  if (remaining.length === 0) {
    await completeRequest(req, origin);
    return;
  }
  if (req.sequential) {
    const up = signersUpNow(req).filter((s) => s.status === "PENDING");
    if (up.length > 0) await emailSigners(req, up, origin);
  }
}

async function completeRequest(req: FullRequest, origin: string) {
  const original = await getObjectBuffer(req.version.fileKey!);
  const originalHash = sha256Hex(original);

  const signerById = new Map(req.signers.map((s) => [s.id, s]));
  const placements: StampPlacement[] = req.fields.map((f) => {
    const s = signerById.get(f.signerId)!;
    return {
      kind: f.kind,
      page: f.page,
      xPct: f.xPct,
      yPct: f.yPct,
      wPct: f.wPct,
      hPct: f.hPct,
      pngDataUrl:
        f.kind === "SIGNATURE"
          ? s.signatureData
          : f.kind === "INITIALS"
            ? s.initialsData
            : null,
      text: f.value,
    };
  });

  const completedAt = new Date();
  const events = await db.signingEvent.findMany({
    where: { requestId: req.id },
    orderBy: { createdAt: "asc" },
  });
  const doc = await stampFields(original, placements);
  await appendCertificate(doc, {
    requestId: req.id,
    title: req.title,
    documentName: req.document.name,
    originalHash,
    completedAt,
    signers: activeSigners(req).map((s) => ({
      name: s.name,
      email: s.email,
      ip: s.ip,
      userAgent: s.userAgent,
      viewedAt: s.viewedAt,
      signedAt: s.signedAt,
    })),
    events: [
      ...events.map((e) => ({
        type: e.type,
        who: e.signerId
          ? (signerById.get(e.signerId)?.email ?? null)
          : null,
        at: e.createdAt,
        ip: e.ip,
      })),
      // logged to the DB after sealing (it carries the final hash), but it
      // belongs on the printed trail
      { type: "completed", who: null, at: completedAt, ip: null },
    ],
  });
  const sealed = await sealPdf(await doc.save());
  const finalHash = sha256Hex(sealed);
  const key = newFileKey(req.teamId, `${req.title} (signed).pdf`);
  await putObject(key, sealed, "application/pdf");

  await db.signatureRequest.update({
    where: { id: req.id },
    data: {
      status: "COMPLETED",
      completedAt,
      signedFileKey: key,
      finalHash,
    },
  });
  await logEvent(req.id, "completed", { meta: { finalHash } });

  // Every party gets the final copy: signers and CCs via their token link
  // (which re-establishes their session on any device), the team in-app.
  await Promise.allSettled(
    req.signers.map((s) =>
      sendSignatureCompleted({
        email: s.email,
        url: `${origin}/sign/t/${s.token}`,
        documentName: req.title,
      })
    )
  );
  await notifyTeam(req.teamId, "signature_completed", {
    itemName: req.title,
    href: `/signatures/${req.id}`,
  });
  await dispatchWebhooks(req.teamId, "signature.completed", {
    requestId: req.id,
    title: req.title,
    documentId: req.documentId,
    finalHash,
  });
}

export async function declineSigner(
  signerId: string,
  reason: string | null,
  ip: string | null,
  userAgent: string | null
): Promise<{ ok: true } | { error: string }> {
  const signer = await db.signer.findUnique({
    where: { id: signerId },
    include: { request: true },
  });
  if (!signer || signer.request.status !== "SENT")
    return { error: "This request is no longer open." };
  if (signer.status === "SIGNED" || signer.status === "DECLINED")
    return { error: "This request is no longer open." };

  await db.$transaction([
    db.signer.update({
      where: { id: signerId },
      data: {
        status: "DECLINED",
        declinedAt: new Date(),
        declineReason: reason,
        ip,
        userAgent,
      },
    }),
    db.signatureRequest.update({
      where: { id: signer.requestId },
      data: { status: "DECLINED" },
    }),
  ]);
  await logEvent(signer.requestId, "declined", {
    signerId,
    ip,
    userAgent,
    meta: { reason },
  });
  const req = await db.signatureRequest.findUnique({
    where: { id: signer.requestId },
  });
  await notifyTeam(signer.request.teamId, "signature_declined", {
    who: signer.name ?? signer.email,
    itemName: req?.title ?? "a document",
    detail: reason ?? undefined,
    href: `/signatures/${signer.requestId}`,
  });
  await dispatchWebhooks(signer.request.teamId, "signature.declined", {
    requestId: signer.requestId,
    signer: signer.email,
    reason,
  });
  return { ok: true };
}

export async function voidRequest(
  requestId: string,
  teamId: string,
  reason: string | null
): Promise<{ ok: true } | { error: string }> {
  const req = await db.signatureRequest.findFirst({
    where: { id: requestId, teamId },
  });
  if (!req || req.status === "COMPLETED" || req.status === "VOIDED")
    return { error: "Request unavailable." };
  await db.signatureRequest.update({
    where: { id: requestId },
    data: { status: "VOIDED", voidReason: reason },
  });
  await logEvent(requestId, "voided", { meta: { reason } });
  await dispatchWebhooks(teamId, "signature.voided", { requestId, reason });
  return { ok: true };
}

/** Manual "remind" from the dashboard: re-email whoever is up now. */
export async function remindPending(
  requestId: string,
  teamId: string,
  origin: string
): Promise<{ ok: true; count: number } | { error: string }> {
  const req = await getFullRequest(requestId);
  if (!req || req.teamId !== teamId || req.status !== "SENT")
    return { error: "Request unavailable." };
  const up = signersUpNow(req);
  await Promise.allSettled(
    up.map((s) =>
      sendSignatureReminder({
        email: s.email,
        url: `${origin}/sign/t/${s.token}`,
        documentName: req.title,
        teamName: req.team.name,
      })
    )
  );
  await db.signer.updateMany({
    where: { id: { in: up.map((s) => s.id) } },
    data: { lastSentAt: new Date() },
  });
  await db.signatureRequest.update({
    where: { id: requestId },
    data: { lastReminderAt: new Date() },
  });
  for (const s of up)
    await logEvent(requestId, "reminded", { signerId: s.id });
  return { ok: true, count: up.length };
}

/** Cron sweep: expire overdue requests, send scheduled reminders. */
export async function runSignatureCron(origin: string) {
  const now = new Date();
  let expired = 0;
  let reminded = 0;

  const overdue = await db.signatureRequest.findMany({
    where: { status: "SENT", expiresAt: { lt: now } },
  });
  for (const req of overdue) {
    await db.signatureRequest.update({
      where: { id: req.id },
      data: { status: "EXPIRED" },
    });
    await logEvent(req.id, "expired");
    await dispatchWebhooks(req.teamId, "signature.expired", {
      requestId: req.id,
    });
    expired++;
  }

  const due = await db.signatureRequest.findMany({
    where: { status: "SENT", reminderEveryDays: { not: null } },
    select: { id: true, teamId: true, reminderEveryDays: true, lastReminderAt: true, sentAt: true },
  });
  for (const req of due) {
    const since = req.lastReminderAt ?? req.sentAt;
    if (!since) continue;
    const elapsedDays = (now.getTime() - since.getTime()) / 86_400_000;
    if (elapsedDays < req.reminderEveryDays!) continue;
    const res = await remindPending(req.id, req.teamId, origin);
    if ("count" in res) reminded += res.count;
  }
  return { expired, reminded };
}
