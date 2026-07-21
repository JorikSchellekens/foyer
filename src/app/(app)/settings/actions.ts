"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTeam, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomToken, generateApiKey } from "@/lib/tokens";
import { sendTeamInvite } from "@/lib/email";
import { requestOrigin } from "@/lib/origin";
import { autoConfigureDomain, checkDomain, appHost } from "@/lib/cloudflare";
import type { TeamRole } from "@prisma/client";

// ---------- team ----------

export async function renameTeam(name: string) {
  const ctx = await requireRole();
  if (!name.trim()) return { error: "Team name is required." };
  await db.team.update({
    where: { id: ctx.team.id },
    data: { name: name.trim() },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- members & invites ----------

export async function inviteMember(email: string, role: TeamRole) {
  const ctx = await requireRole();
  const parsed = z.string().email().safeParse(email.trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid email address." };

  const existing = await db.teamMember.findFirst({
    where: { teamId: ctx.team.id, user: { email: parsed.data } },
  });
  if (existing) return { error: "That person is already a member." };

  const token = randomToken(24);
  await db.teamInvite.upsert({
    where: { teamId_email: { teamId: ctx.team.id, email: parsed.data } },
    update: {
      token,
      role,
      expiresAt: new Date(Date.now() + 14 * 86400_000),
    },
    create: {
      teamId: ctx.team.id,
      email: parsed.data,
      role,
      token,
      invitedBy: ctx.user.id,
      expiresAt: new Date(Date.now() + 14 * 86400_000),
    },
  });
  await sendTeamInvite({
    email: parsed.data,
    inviteUrl: `${await requestOrigin()}/invite/${token}`,
    teamName: ctx.team.name,
    inviterName: ctx.user.name ?? ctx.user.email,
  });
  revalidatePath("/settings/members");
  return { ok: true };
}

export async function revokeInvite(inviteId: string) {
  const ctx = await requireRole();
  await db.teamInvite.deleteMany({
    where: { id: inviteId, teamId: ctx.team.id },
  });
  revalidatePath("/settings/members");
}

export async function resendInvite(inviteId: string) {
  const ctx = await requireRole();
  const invite = await db.teamInvite.findFirst({
    where: { id: inviteId, teamId: ctx.team.id },
  });
  if (!invite) return { error: "Invite not found." };
  const token = randomToken(24);
  await db.teamInvite.update({
    where: { id: invite.id },
    data: { token, expiresAt: new Date(Date.now() + 14 * 86400_000) },
  });
  await sendTeamInvite({
    email: invite.email,
    inviteUrl: `${await requestOrigin()}/invite/${token}`,
    teamName: ctx.team.name,
    inviterName: ctx.user.name ?? ctx.user.email,
  });
  revalidatePath("/settings/members");
  return { ok: true };
}

export async function setMemberRole(memberId: string, role: TeamRole) {
  const ctx = await requireRole(["OWNER"]);
  const member = await db.teamMember.findFirst({
    where: { id: memberId, teamId: ctx.team.id },
  });
  if (!member) return { error: "Member not found." };
  if (member.userId === ctx.user.id)
    return { error: "You cannot change your own role." };
  await db.teamMember.update({ where: { id: memberId }, data: { role } });
  revalidatePath("/settings/members");
  return { ok: true };
}

export async function removeMember(memberId: string) {
  const ctx = await requireRole();
  const member = await db.teamMember.findFirst({
    where: { id: memberId, teamId: ctx.team.id },
  });
  if (!member) return { error: "Member not found." };
  if (member.role === "OWNER") return { error: "Owners cannot be removed." };
  await db.teamMember.delete({ where: { id: memberId } });
  revalidatePath("/settings/members");
  return { ok: true };
}

/** Granular per-dataroom/document access for a member. */
export async function setMemberPermissions(
  memberId: string,
  grants: {
    resourceType: "DATAROOM" | "DOCUMENT";
    resourceId: string;
    level: "VIEW" | "EDIT" | "MANAGE" | "NONE";
  }[]
) {
  const ctx = await requireRole();
  const member = await db.teamMember.findFirst({
    where: { id: memberId, teamId: ctx.team.id },
  });
  if (!member) return { error: "Member not found." };
  for (const grant of grants) {
    if (grant.level === "NONE") {
      await db.resourcePermission.deleteMany({
        where: {
          memberId,
          resourceType: grant.resourceType,
          resourceId: grant.resourceId,
        },
      });
    } else {
      await db.resourcePermission.upsert({
        where: {
          memberId_resourceType_resourceId: {
            memberId,
            resourceType: grant.resourceType,
            resourceId: grant.resourceId,
          },
        },
        update: { level: grant.level },
        create: {
          memberId,
          resourceType: grant.resourceType,
          resourceId: grant.resourceId,
          level: grant.level,
        },
      });
    }
  }
  revalidatePath("/settings/members");
  return { ok: true };
}

// ---------- domains ----------

export async function addDomain(domainRaw: string, cloudflareToken?: string) {
  const ctx = await requireRole();
  const domain = domainRaw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
    return { error: "Enter a valid domain like dataroom.yourcompany.com." };

  const existing = await db.domain.findUnique({ where: { domain } });
  if (existing) return { error: "That domain is already registered." };

  const record = await db.domain.create({
    data: { teamId: ctx.team.id, domain },
  });

  const token = cloudflareToken?.trim() || process.env.CLOUDFLARE_API_TOKEN;
  let autoConfigured = false;
  let autoError: string | null = null;
  if (token) {
    const result = await autoConfigureDomain({
      token,
      domain,
      target: appHost().split(":")[0],
    });
    if (result.ok) {
      autoConfigured = true;
      await db.domain.update({
        where: { id: record.id },
        data: {
          cloudflareZoneId: result.zoneId,
          cloudflareRecordId: result.recordId,
        },
      });
    } else {
      autoError = result.error;
    }
  }

  revalidatePath("/settings/domains");
  return { ok: true, autoConfigured, autoError };
}

export async function verifyDomain(domainId: string) {
  const ctx = await requireTeam();
  const domain = await db.domain.findFirst({
    where: { id: domainId, teamId: ctx.team.id },
  });
  if (!domain) return { error: "Domain not found." };
  const ok = await checkDomain(domain.domain);
  await db.domain.update({
    where: { id: domain.id },
    data: {
      status: ok ? "VERIFIED" : "PENDING",
      lastCheckedAt: new Date(),
    },
  });
  revalidatePath("/settings/domains");
  return ok
    ? { ok: true }
    : {
        error:
          "Not verified yet. DNS can take a few minutes to propagate; check the CNAME and try again.",
      };
}

export async function deleteDomain(domainId: string) {
  const ctx = await requireRole();
  await db.domain.deleteMany({
    where: { id: domainId, teamId: ctx.team.id },
  });
  revalidatePath("/settings/domains");
}

// ---------- notifications ----------

export async function setNotificationPref(key: string, email: boolean) {
  const ctx = await requireTeam();
  await db.notificationPreference.upsert({
    where: {
      userId_teamId_key: { userId: ctx.user.id, teamId: ctx.team.id, key },
    },
    update: { email },
    create: { userId: ctx.user.id, teamId: ctx.team.id, key, email },
  });
  revalidatePath("/settings/notifications");
}

// ---------- presets ----------

export async function savePreset(preset: {
  id?: string;
  name: string;
  isDefault: boolean;
  config: Record<string, unknown>;
}) {
  const ctx = await requireTeam();
  if (!preset.name.trim()) return { error: "Preset name is required." };
  if (preset.isDefault) {
    await db.linkPreset.updateMany({
      where: { teamId: ctx.team.id },
      data: { isDefault: false },
    });
  }
  if (preset.id) {
    await db.linkPreset.updateMany({
      where: { id: preset.id, teamId: ctx.team.id },
      data: {
        name: preset.name.trim(),
        isDefault: preset.isDefault,
        config: preset.config as object,
      },
    });
  } else {
    await db.linkPreset.create({
      data: {
        teamId: ctx.team.id,
        name: preset.name.trim(),
        isDefault: preset.isDefault,
        config: preset.config as object,
      },
    });
  }
  revalidatePath("/settings/presets");
  return { ok: true };
}

export async function deletePreset(presetId: string) {
  const ctx = await requireTeam();
  await db.linkPreset.deleteMany({
    where: { id: presetId, teamId: ctx.team.id },
  });
  revalidatePath("/settings/presets");
}

// ---------- API tokens ----------

export async function createApiToken(name: string) {
  const ctx = await requireTeam();
  if (!name.trim()) return { error: "Give the token a name." };
  const { key, hashed, partial } = generateApiKey();
  await db.apiToken.create({
    data: {
      teamId: ctx.team.id,
      userId: ctx.user.id,
      name: name.trim(),
      hashedKey: hashed,
      partialKey: partial,
    },
  });
  revalidatePath("/settings/tokens");
  return { key };
}

export async function revokeApiToken(tokenId: string) {
  const ctx = await requireTeam();
  await db.apiToken.deleteMany({
    where: { id: tokenId, teamId: ctx.team.id },
  });
  revalidatePath("/settings/tokens");
}

// ---------- webhooks ----------

export async function saveWebhook(hook: {
  id?: string;
  url: string;
  events: string[];
  active: boolean;
}) {
  const ctx = await requireRole();
  try {
    const u = new URL(hook.url);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error();
  } catch {
    return { error: "Enter a valid webhook URL." };
  }
  if (hook.id) {
    await db.webhook.updateMany({
      where: { id: hook.id, teamId: ctx.team.id },
      data: { url: hook.url, events: hook.events, active: hook.active },
    });
  } else {
    await db.webhook.create({
      data: {
        teamId: ctx.team.id,
        url: hook.url,
        events: hook.events,
        secret: randomToken(24),
        active: hook.active,
      },
    });
  }
  revalidatePath("/settings/webhooks");
  return { ok: true };
}

export async function deleteWebhook(hookId: string) {
  const ctx = await requireRole();
  await db.webhook.deleteMany({ where: { id: hookId, teamId: ctx.team.id } });
  revalidatePath("/settings/webhooks");
}

// ---------- agreements ----------

export async function saveAgreement(agreement: {
  id?: string;
  name: string;
  requireName: boolean;
  type: "EMBEDDED" | "LINK" | "TEXT";
  fileKey?: string | null;
  externalUrl?: string | null;
  content?: string | null;
}) {
  const ctx = await requireTeam();
  if (!agreement.name.trim()) return { error: "Give the agreement a name." };
  if (agreement.type === "EMBEDDED" && !agreement.fileKey && !agreement.id)
    return { error: "Upload the agreement PDF." };
  if (agreement.type === "LINK" && !agreement.externalUrl)
    return { error: "Provide the agreement URL." };
  if (agreement.type === "TEXT" && !agreement.content?.trim())
    return { error: "Write the agreement text." };

  const data = {
    name: agreement.name.trim(),
    requireName: agreement.requireName,
    type: agreement.type,
    fileKey: agreement.fileKey ?? undefined,
    externalUrl: agreement.externalUrl ?? null,
    content: agreement.content ?? null,
  };
  if (agreement.id) {
    await db.agreement.updateMany({
      where: { id: agreement.id, teamId: ctx.team.id },
      data,
    });
  } else {
    await db.agreement.create({ data: { ...data, teamId: ctx.team.id } });
  }
  revalidatePath("/settings/agreements");
  return { ok: true };
}

export async function deleteAgreement(agreementId: string) {
  const ctx = await requireTeam();
  await db.agreement.deleteMany({
    where: { id: agreementId, teamId: ctx.team.id },
  });
  revalidatePath("/settings/agreements");
}
