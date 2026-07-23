"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/tokens";
import { requestOrigin } from "@/lib/origin";
import { placedFieldSchema } from "@/lib/sign-fields";
import { sendRequest, remindPending, voidRequest } from "@/lib/signing";

async function ownRequest(id: string) {
  const ctx = await requireTeam();
  const request = await db.signatureRequest.findFirst({
    where: { id, teamId: ctx.team.id },
  });
  return { ctx, request };
}

/** Form action: the button only renders for uploaded PDFs, so guard failures
 * (a stale page) just land back on the document. */
export async function createSignatureDraft(documentId: string): Promise<void> {
  const ctx = await requireTeam();
  const doc = await db.document.findFirst({
    where: { id: documentId, teamId: ctx.team.id },
    include: { currentVersion: true },
  });
  if (!doc) redirect("/documents");
  if (doc.type !== "PDF" || !doc.currentVersion?.fileKey)
    redirect(`/documents/${documentId}`);

  const request = await db.signatureRequest.create({
    data: {
      teamId: ctx.team.id,
      documentId: doc.id,
      versionId: doc.currentVersion.id,
      title: doc.name,
      createdById: ctx.user.id,
    },
  });
  redirect(`/signatures/${request.id}`);
}

export async function updateSignatureRequest(
  id: string,
  patch: {
    title?: string;
    message?: string | null;
    sequential?: boolean;
    expiresAt?: string | null;
    reminderEveryDays?: number | null;
  }
) {
  const { request } = await ownRequest(id);
  if (!request || request.status !== "DRAFT")
    return { error: "Request unavailable." };
  await db.signatureRequest.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() || request.title } : {}),
      ...(patch.message !== undefined ? { message: patch.message?.trim() || null } : {}),
      ...(patch.sequential !== undefined ? { sequential: patch.sequential } : {}),
      ...(patch.expiresAt !== undefined
        ? { expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : null }
        : {}),
      ...(patch.reminderEveryDays !== undefined
        ? { reminderEveryDays: patch.reminderEveryDays }
        : {}),
    },
  });
  revalidatePath(`/signatures/${id}`);
  return { ok: true };
}

const signersSchema = z
  .array(
    z.object({
      id: z.string().optional(),
      email: z.string().email(),
      name: z.string().max(120).optional(),
      role: z.enum(["SIGNER", "CC"]).default("SIGNER"),
      order: z.number().int().min(0).default(0),
    })
  )
  .max(20);

/** Replace the draft's recipient set; removed signers lose their fields. */
export async function saveSigners(id: string, input: unknown) {
  const { request } = await ownRequest(id);
  if (!request || request.status !== "DRAFT")
    return { error: "Request unavailable." };
  const parsed = signersSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid recipients." };
  const wanted = parsed.data.map((s) => ({
    ...s,
    email: s.email.trim().toLowerCase(),
  }));
  if (new Set(wanted.map((s) => s.email)).size !== wanted.length)
    return { error: "Each recipient needs a distinct email." };

  const existing = await db.signer.findMany({ where: { requestId: id } });
  const keptIds = new Set(wanted.map((s) => s.id).filter(Boolean));
  await db.signer.deleteMany({
    where: { requestId: id, id: { notIn: [...keptIds] as string[] } },
  });
  const result: { id: string; email: string }[] = [];
  for (const s of wanted) {
    if (s.id && existing.some((e) => e.id === s.id)) {
      const updated = await db.signer.update({
        where: { id: s.id },
        data: { email: s.email, name: s.name?.trim() || null, role: s.role, order: s.order },
      });
      result.push({ id: updated.id, email: updated.email });
    } else {
      const created = await db.signer.create({
        data: {
          requestId: id,
          email: s.email,
          name: s.name?.trim() || null,
          role: s.role,
          order: s.order,
          token: randomToken(),
        },
      });
      result.push({ id: created.id, email: created.email });
    }
  }
  revalidatePath(`/signatures/${id}`);
  return { ok: true, signers: result };
}

/** Replace the draft's placed fields wholesale (the editor owns the set). */
export async function saveFields(id: string, input: unknown) {
  const { request } = await ownRequest(id);
  if (!request || request.status !== "DRAFT")
    return { error: "Request unavailable." };
  const parsed = z.array(placedFieldSchema).max(500).safeParse(input);
  if (!parsed.success) return { error: "Invalid fields." };
  const signerIds = new Set(
    (await db.signer.findMany({ where: { requestId: id }, select: { id: true } })).map(
      (s) => s.id
    )
  );
  if (parsed.data.some((f) => !signerIds.has(f.signerId)))
    return { error: "Field assigned to an unknown recipient." };

  await db.$transaction([
    db.signatureField.deleteMany({ where: { requestId: id } }),
    db.signatureField.createMany({
      data: parsed.data.map((f) => ({
        requestId: id,
        signerId: f.signerId,
        kind: f.kind,
        page: f.page,
        xPct: f.xPct,
        yPct: f.yPct,
        wPct: f.wPct,
        hPct: f.hPct,
        required: f.required,
      })),
    }),
  ]);
  revalidatePath(`/signatures/${id}`);
  return { ok: true };
}

export async function sendSignatureRequest(id: string) {
  const { request } = await ownRequest(id);
  if (!request) return { error: "Request unavailable." };
  const res = await sendRequest(id, await requestOrigin());
  revalidatePath(`/signatures/${id}`);
  revalidatePath("/signatures");
  return res;
}

export async function remindSigners(id: string) {
  const { ctx, request } = await ownRequest(id);
  if (!request) return { error: "Request unavailable." };
  const res = await remindPending(id, ctx.team.id, await requestOrigin());
  revalidatePath(`/signatures/${id}`);
  return res;
}

export async function voidSignatureRequest(id: string, reason: string) {
  const { ctx, request } = await ownRequest(id);
  if (!request) return { error: "Request unavailable." };
  const res = await voidRequest(id, ctx.team.id, reason.trim() || null);
  revalidatePath(`/signatures/${id}`);
  revalidatePath("/signatures");
  return res;
}

export async function deleteSignatureDraft(id: string) {
  const { request } = await ownRequest(id);
  if (!request || request.status !== "DRAFT")
    return { error: "Only drafts can be deleted." };
  await db.signatureRequest.delete({ where: { id } });
  revalidatePath("/signatures");
  redirect("/signatures");
}
