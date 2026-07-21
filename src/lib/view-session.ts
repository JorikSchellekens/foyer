import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { signPayload } from "@/lib/auth";
import { notifyTeam } from "@/lib/notify";
import {
  getViewerSession,
  setViewerSession,
  type FullLink,
  type ViewerSession,
} from "@/lib/access";

async function requestMeta() {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const { UAParser } = await import("ua-parser-js");
  const parsed = new UAParser(ua).getResult();
  return {
    ip,
    browser: parsed.browser.name ?? null,
    os: parsed.os.name ?? null,
    device: parsed.device.type ?? "desktop",
    country: h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? null,
    city: h.get("x-vercel-ip-city") ?? null,
  };
}

/** Find or create the Viewer identity for an email within a team. */
async function upsertViewer(teamId: string, email: string, verified: boolean) {
  return db.viewer.upsert({
    where: { teamId_email: { teamId, email: email.toLowerCase() } },
    update: verified ? { verified: true } : {},
    create: { teamId, email: email.toLowerCase(), verified },
  });
}

/**
 * Ensure a View row exists for this granted session (dataroom entry or
 * document view). Returns the view plus a signed token the client uses to
 * post tracking beacons.
 */
export async function ensureView(
  link: FullLink,
  session: ViewerSession,
  opts: { documentId?: string } = {}
): Promise<{ viewId: string; trackToken: string }> {
  const meta = await requestMeta();
  const viewer = session.email
    ? await upsertViewer(link.teamId, session.email, !!session.verified)
    : null;

  // Top-level view id lives in the session (persisted by the client via
  // /api/view/claim, since cookies cannot be set during render); document
  // views within a dataroom get their own row per document.
  //
  // Only continue an existing view when it is genuinely the same visit:
  // same link, same visitor identity, and active within the last 30 minutes.
  // Otherwise this is a new visit (or a new identity) and gets its own row.
  if (!opts.documentId && session.viewId) {
    const existing = await db.view.findUnique({
      where: { id: session.viewId },
    });
    const sameIdentity =
      (existing?.viewerEmail ?? null) ===
      (session.email?.toLowerCase() ?? null);
    const recent =
      !!existing &&
      existing.lastActiveAt > new Date(Date.now() - 30 * 60_000);
    if (existing && existing.linkId === link.id && sameIdentity && recent) {
      return {
        viewId: existing.id,
        trackToken: await signPayload({ vid: existing.id, lid: link.id }, "24h"),
      };
    }
  }

  if (opts.documentId) {
    // reuse a recent view row for the same doc in this session (< 30 min old)
    const recent = await db.view.findFirst({
      where: {
        linkId: link.id,
        documentId: opts.documentId,
        viewerEmail: session.email ?? null,
        lastActiveAt: { gt: new Date(Date.now() - 30 * 60_000) },
      },
      orderBy: { startedAt: "desc" },
    });
    if (recent) {
      return {
        viewId: recent.id,
        trackToken: await signPayload({ vid: recent.id, lid: link.id }, "24h"),
      };
    }
  }

  const view = await db.view.create({
    data: {
      linkId: link.id,
      viewerId: viewer?.id ?? null,
      viewerEmail: session.email ?? null,
      verified: !!session.verified,
      agreementDone: !!session.agreed,
      documentId:
        opts.documentId ??
        (link.target === "DOCUMENT" ? link.documentId : null),
      dataroomId: link.target === "DATAROOM" ? link.dataroomId : null,
      ...meta,
    },
  });

  const itemName =
    opts.documentId != null
      ? (
          await db.document.findUnique({
            where: { id: opts.documentId },
            select: { name: true },
          })
        )?.name ?? "a document"
      : link.document?.name ?? link.dataroom?.name ?? link.name;

  if (link.notifyOnAccess) {
    const key =
      link.target === "DATAROOM" && !opts.documentId
        ? "dataroom_visited"
        : "document_viewed";
    await notifyTeam(link.teamId, key, {
      who: session.email ?? null,
      itemName,
      linkName: link.name,
      href:
        link.target === "DATAROOM"
          ? `/datarooms/${link.dataroomId}?tab=analytics`
          : `/documents/${link.documentId}`,
    });
  }

  return {
    viewId: view.id,
    trackToken: await signPayload({ vid: view.id, lid: link.id }, "24h"),
  };
}

export async function recordBlockedAttempt(
  link: FullLink,
  email: string,
  reason: string
) {
  await notifyTeam(link.teamId, "blocked_access", {
    who: email,
    linkName: link.name,
    detail: reason,
  });
}

export { getViewerSession, setViewerSession };
