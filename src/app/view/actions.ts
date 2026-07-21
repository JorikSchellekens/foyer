"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getViewerSession,
  setViewerSession,
  isEmailAllowed,
  resolveLink,
} from "@/lib/access";
import { verifyPassword, createVerificationToken } from "@/lib/tokens";
import { sendViewerVerification } from "@/lib/email";
import { recordBlockedAttempt } from "@/lib/view-session";
import { notifyTeam } from "@/lib/notify";

async function loadLink(slug: string) {
  const h = await headers();
  const host = h.get("host") ?? "";
  return resolveLink(host, slug);
}

export async function submitPassword(slug: string, password: string) {
  const link = await loadLink(slug);
  if (!link || !link.passwordHash) return { error: "Link unavailable." };
  if (!verifyPassword(password, link.passwordHash))
    return { error: "That password is not correct." };
  const session = await getViewerSession(link.id);
  await setViewerSession({ ...session, linkId: link.id, pwOk: true });
  revalidatePath(`/view/${slug}`);
  return { ok: true };
}

export async function submitEmail(
  slug: string,
  emailRaw: string,
  name?: string
) {
  const link = await loadLink(slug);
  if (!link) return { error: "Link unavailable." };
  const parsed = z.string().email().safeParse(emailRaw.trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid email address." };
  const email = parsed.data;

  const allowed = isEmailAllowed(link, email);
  if (!allowed.allowed) {
    await recordBlockedAttempt(link, email, allowed.reason!);
    return { error: allowed.reason };
  }

  const session = await getViewerSession(link.id);

  if (link.accessMode === "EMAIL_VERIFIED") {
    const token = await createVerificationToken({
      email,
      purpose: "VIEWER_VERIFY",
      context: { linkId: link.id, slug, name: name ?? null },
      ttlMinutes: 30,
    });
    const itemName =
      link.document?.name ?? link.dataroom?.name ?? link.name;
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const proto = host.startsWith("localhost") ? "http" : "https";
    await sendViewerVerification(
      email,
      `${proto}://${host}/api/view/verify?token=${token}`,
      itemName
    );
    await setViewerSession({
      ...session,
      linkId: link.id,
      email,
      name,
      verified: false,
    });
    revalidatePath(`/view/${slug}`);
    return { ok: true, pendingVerification: true };
  }

  await setViewerSession({
    ...session,
    linkId: link.id,
    email,
    name,
    verified: false,
  });
  revalidatePath(`/view/${slug}`);
  return { ok: true };
}

export async function signAgreement(
  slug: string,
  payload: { name?: string; signatureData?: string }
) {
  const link = await loadLink(slug);
  if (!link || !link.agreement) return { error: "Link unavailable." };
  const session = await getViewerSession(link.id);
  if (link.agreement.requireName && !payload.name?.trim())
    return { error: "Enter your full name to sign." };
  if (link.agreement.type === "EMBEDDED" && !payload.signatureData)
    return { error: "Draw your signature to continue." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // The response is recorded against the view created after granting; store
  // it in a standalone row keyed by a temporary view once granted. To keep an
  // audit trail even before the View exists, create it now bound to a
  // lightweight View row.
  const view = await db.view.create({
    data: {
      linkId: link.id,
      viewerEmail: session.email ?? null,
      verified: !!session.verified,
      agreementDone: true,
      documentId: link.target === "DOCUMENT" ? link.documentId : null,
      dataroomId: link.target === "DATAROOM" ? link.dataroomId : null,
      totalDuration: 0,
      ip,
    },
  });
  await db.agreementResponse.create({
    data: {
      agreementId: link.agreement.id,
      viewId: view.id,
      name: payload.name?.trim() || null,
      email: session.email ?? null,
      signatureData: payload.signatureData ?? null,
      ip,
    },
  });

  await setViewerSession({
    ...session,
    linkId: link.id,
    name: payload.name ?? session.name,
    agreed: true,
    viewId: view.id,
  });
  revalidatePath(`/view/${slug}`);
  return { ok: true };
}

export async function askQuestion(slug: string, body: string) {
  const link = await loadLink(slug);
  if (!link || !link.enableQA || !link.dataroomId)
    return { error: "Questions are not enabled here." };
  if (!body.trim()) return { error: "Write a question first." };
  const session = await getViewerSession(link.id);
  await db.dataroomQuestion.create({
    data: {
      dataroomId: link.dataroomId,
      viewerEmail: session.email ?? null,
      body: body.trim().slice(0, 4000),
    },
  });
  await notifyTeam(link.teamId, "new_question", {
    who: session.email ?? "An anonymous visitor",
    itemName: link.dataroom?.name ?? "your data room",
    detail: body.trim().slice(0, 500),
    href: `/datarooms/${link.dataroomId}?tab=qa`,
  });
  revalidatePath(`/view/${slug}`);
  return { ok: true };
}
