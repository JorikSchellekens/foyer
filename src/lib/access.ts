import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { signPayload, verifyPayload } from "@/lib/auth";
import { appHost } from "@/lib/cloudflare";
import type { Prisma } from "@prisma/client";

export const linkInclude = {
  team: true,
  domain: true,
  agreement: true,
  previewPreset: true,
  document: {
    include: { currentVersion: true },
  },
  dataroom: {
    include: {
      folders: { orderBy: [{ orderIndex: "asc" }, { name: "asc" }] },
      documents: {
        include: { document: { include: { currentVersion: true } } },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      },
      branding: true,
    },
  },
  permissions: true,
} satisfies Prisma.LinkInclude;

export type FullLink = Prisma.LinkGetPayload<{ include: typeof linkInclude }>;

/**
 * Resolve a link by request host + slug. A host that matches a registered
 * custom domain serves that domain's links; any other host (the configured
 * app URL, localhost on any port, a LAN IP, a tunnel) serves default links.
 */
export async function resolveLink(
  host: string,
  slug: string
): Promise<FullLink | null> {
  if (host && host !== appHost()) {
    const domain = await db.domain.findUnique({ where: { domain: host } });
    if (domain) {
      return db.link.findFirst({
        where: { slug, domainId: domain.id, isArchived: false },
        include: linkInclude,
      });
    }
  }
  return db.link.findFirst({
    where: { slug, domainId: null, isArchived: false },
    include: linkInclude,
  });
}

// ---------- viewer gate session (per-link cookie) ----------

export type ViewerSession = {
  linkId: string;
  email?: string;
  name?: string;
  verified?: boolean;
  agreed?: boolean;
  pwOk?: boolean;
  viewId?: string;
};

const cookieName = (linkId: string) => `fv_${linkId}`;

export async function getViewerSession(
  linkId: string
): Promise<ViewerSession> {
  const store = await cookies();
  const raw = store.get(cookieName(linkId))?.value;
  if (!raw) return { linkId };
  const payload = await verifyPayload<ViewerSession>(raw);
  if (!payload || payload.linkId !== linkId) return { linkId };
  return payload;
}

export async function setViewerSession(session: ViewerSession) {
  const store = await cookies();
  const token = await signPayload({ ...session }, "7d");
  store.set(cookieName(session.linkId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600,
    path: "/",
  });
}

// ---------- gate evaluation ----------

export type AccessState =
  | { kind: "expired" }
  | { kind: "blocked"; reason: string }
  | { kind: "password" }
  | { kind: "email"; requireVerification: boolean }
  | { kind: "verify-sent" }
  | { kind: "agreement" }
  | { kind: "granted"; email?: string; verified: boolean };

function emailMatches(email: string, entry: string): boolean {
  const e = email.toLowerCase().trim();
  const p = entry.toLowerCase().trim();
  if (!p) return false;
  if (p.includes("@") && !p.startsWith("@")) return e === p;
  const domain = p.startsWith("@") ? p.slice(1) : p;
  return e.endsWith(`@${domain}`);
}

export function isEmailAllowed(
  link: { allowList: string[]; blockList: string[] },
  email: string
): { allowed: boolean; reason?: string } {
  if (link.blockList.some((b) => emailMatches(email, b)))
    return { allowed: false, reason: "This email address has been blocked." };
  if (
    link.allowList.length > 0 &&
    !link.allowList.some((a) => emailMatches(email, a))
  )
    return {
      allowed: false,
      reason: "This email address is not on the access list for this link.",
    };
  return { allowed: true };
}

export function evaluateAccess(
  link: FullLink,
  session: ViewerSession
): AccessState {
  if (link.expiresAt && link.expiresAt < new Date())
    return { kind: "expired" };

  if (link.passwordHash && !session.pwOk) return { kind: "password" };

  const needsEmail =
    link.accessMode !== "PUBLIC" || link.allowList.length > 0;
  const needsVerified = link.accessMode === "EMAIL_VERIFIED";

  if (needsEmail && !session.email)
    return { kind: "email", requireVerification: needsVerified };

  if (session.email) {
    const check = isEmailAllowed(link, session.email);
    if (!check.allowed)
      return { kind: "blocked", reason: check.reason! };
  }

  if (needsVerified && !session.verified) return { kind: "verify-sent" };

  if (link.agreementId && !session.agreed) return { kind: "agreement" };

  return {
    kind: "granted",
    email: session.email,
    verified: !!session.verified,
  };
}

// ---------- dataroom item visibility ----------

export type ItemGrant = { canView: boolean; canDownload: boolean };

/**
 * Effective permission for a dataroom item under a link. A full-access link
 * grants every item (download still gated by allowDownload); otherwise only
 * items with a matching LinkPermission row are granted.
 */
export function itemGrant(
  link: FullLink,
  itemType: "DATAROOM_DOCUMENT" | "DATAROOM_FOLDER",
  itemId: string
): ItemGrant {
  if (link.fullAccess) {
    return { canView: true, canDownload: link.allowDownload };
  }
  const p = link.permissions.find(
    (x) => x.itemType === itemType && x.itemId === itemId
  );
  return p
    ? { canView: p.canView, canDownload: p.canDownload && link.allowDownload }
    : { canView: false, canDownload: false };
}
