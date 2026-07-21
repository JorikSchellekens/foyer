"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { hashPassword, randomToken } from "@/lib/tokens";
import { sendLinkInvite } from "@/lib/email";
import { requestOrigin } from "@/lib/origin";
import { linkConfigSchema, type LinkConfig } from "@/lib/link-config";
import { dispatchWebhooks } from "@/lib/notify";

function revalidateLinkPages() {
  revalidatePath("/links");
  revalidatePath("/documents");
  revalidatePath("/datarooms");
}

async function buildData(teamId: string, config: LinkConfig) {
  const parsed = linkConfigSchema.parse(config);
  return {
    name: parsed.name,
    domainId: parsed.domainId ?? null,
    accessMode: parsed.accessMode,
    ...(parsed.clearPassword
      ? { passwordHash: null }
      : parsed.password
        ? { passwordHash: hashPassword(parsed.password) }
        : {}),
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
    allowDownload: parsed.allowDownload,
    allowList: parsed.allowList.map((s) => s.trim()).filter(Boolean),
    blockList: parsed.blockList.map((s) => s.trim()).filter(Boolean),
    screenshotProtection: parsed.screenshotProtection,
    watermark: parsed.watermark,
    agreementId: parsed.agreementId ?? null,
    notifyOnAccess: parsed.notifyOnAccess,
    enableIndexFile: parsed.enableIndexFile,
    enableQA: parsed.enableQA,
    welcomeMessage: parsed.welcomeMessage ?? null,
    previewPresetId: parsed.previewPresetId ?? null,
    metaTitle: parsed.metaTitle ?? null,
    metaDescription: parsed.metaDescription ?? null,
    metaImageKey: parsed.metaImageKey ?? null,
    groupId: parsed.groupId ?? null,
    fullAccess: parsed.fullAccess,
  };
}

async function resolveSlug(
  requested: string | undefined,
  domainId: string | null,
  excludeLinkId?: string
): Promise<string | { error: string }> {
  const slug = requested?.trim() || generateSlug();
  const clash = await db.link.findFirst({
    where: { slug, domainId, ...(excludeLinkId ? { NOT: { id: excludeLinkId } } : {}) },
  });
  if (clash) return { error: `The path “${slug}” is already in use on this domain.` };
  return slug;
}

export async function createLink(
  target: { type: "DOCUMENT" | "DATAROOM"; id: string },
  config: LinkConfig
) {
  const ctx = await requireTeam();

  if (target.type === "DOCUMENT") {
    const doc = await db.document.findFirst({
      where: { id: target.id, teamId: ctx.team.id },
    });
    if (!doc) return { error: "Document not found." };
  } else {
    const dr = await db.dataroom.findFirst({
      where: { id: target.id, teamId: ctx.team.id },
    });
    if (!dr) return { error: "Data room not found." };
  }

  const data = await buildData(ctx.team.id, config);
  const slug = await resolveSlug(config.slug, data.domainId);
  if (typeof slug !== "string") return slug;

  const link = await db.link.create({
    data: {
      ...data,
      teamId: ctx.team.id,
      slug,
      target: target.type,
      documentId: target.type === "DOCUMENT" ? target.id : null,
      dataroomId: target.type === "DATAROOM" ? target.id : null,
      permissions: {
        create: config.permissions.map((p) => ({
          itemType: p.itemType,
          itemId: p.itemId,
          canView: p.canView,
          canDownload: p.canDownload,
        })),
      },
    },
  });
  await dispatchWebhooks(ctx.team.id, "link.created", {
    linkId: link.id,
    name: link.name,
    target: target.type.toLowerCase(),
  });
  revalidateLinkPages();
  return { id: link.id };
}

export async function updateLink(linkId: string, config: LinkConfig) {
  const ctx = await requireTeam();
  const existing = await db.link.findFirst({
    where: { id: linkId, teamId: ctx.team.id },
  });
  if (!existing) return { error: "Link not found." };

  const data = await buildData(ctx.team.id, config);
  const slug = await resolveSlug(
    config.slug ?? existing.slug,
    data.domainId,
    linkId
  );
  if (typeof slug !== "string") return slug;

  await db.link.update({
    where: { id: linkId },
    data: {
      ...data,
      slug,
      permissions: {
        deleteMany: {},
        create: config.permissions.map((p) => ({
          itemType: p.itemType,
          itemId: p.itemId,
          canView: p.canView,
          canDownload: p.canDownload,
        })),
      },
    },
  });
  revalidateLinkPages();
  return { id: linkId };
}

export async function setLinkArchived(linkId: string, archived: boolean) {
  const ctx = await requireTeam();
  await db.link.updateMany({
    where: { id: linkId, teamId: ctx.team.id },
    data: { isArchived: archived },
  });
  revalidateLinkPages();
}

export async function deleteLink(linkId: string) {
  const ctx = await requireTeam();
  await db.link.deleteMany({ where: { id: linkId, teamId: ctx.team.id } });
  revalidateLinkPages();
}

/** Email people a personal, optionally expiring token URL for a link. */
export async function inviteRecipients(
  linkId: string,
  emails: string[],
  expiresInDays: number | null
) {
  const ctx = await requireTeam();
  const link = await db.link.findFirst({
    where: { id: linkId, teamId: ctx.team.id },
    include: { document: true, dataroom: true, domain: true },
  });
  if (!link) return { error: "Link not found." };
  const itemName = link.document?.name ?? link.dataroom?.name ?? link.name;
  const origin = await requestOrigin();
  const inviteUrl = (token: string) =>
    link!.domain
      ? `https://${link!.domain.domain}/t/${token}`
      : `${origin}/view/t/${token}`;

  const clean = [
    ...new Set(
      emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"))
    ),
  ];
  if (clean.length === 0) return { error: "Add at least one email address." };

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400_000)
    : null;

  for (const email of clean) {
    const token = randomToken(24);
    await db.linkRecipient.upsert({
      where: { linkId_email: { linkId, email } },
      update: { token, expiresAt, lastSentAt: new Date() },
      create: { linkId, email, token, expiresAt },
    });
    await sendLinkInvite({
      email,
      url: inviteUrl(token),
      itemName,
      teamName: ctx.team.name,
      expiresAt,
    });
  }
  revalidateLinkPages();
  return { sent: clean.length };
}

export async function revokeRecipient(recipientId: string) {
  const ctx = await requireTeam();
  await db.linkRecipient.deleteMany({
    where: { id: recipientId, link: { teamId: ctx.team.id } },
  });
  revalidateLinkPages();
}
