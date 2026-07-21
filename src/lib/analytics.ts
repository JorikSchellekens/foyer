import "server-only";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";

export type HotLead = {
  email: string;
  viewerId: string | null;
  score: number;
  reason: string;
  visits: number;
  totalTime: number;
  lastSeen: string;
};

/**
 * Rank identified visitors by how "worth following up" they are over a recent
 * window. The score is a deliberately simple heuristic (a ranking, not a
 * measured value): reading time, plus bonuses for high completion, repeat
 * visits and downloads. Anonymous views are skipped - a lead needs an email.
 */
export async function hotLeads(
  teamId: string,
  { days = 14, limit = 5 }: { days?: number; limit?: number } = {}
): Promise<HotLead[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const extFilter = externalViews(await teamMemberEmails(teamId));

  const views = await db.view.findMany({
    where: {
      link: { teamId },
      startedAt: { gt: since },
      viewerEmail: { not: null },
      ...extFilter,
    },
    select: {
      viewerId: true,
      viewerEmail: true,
      totalDuration: true,
      completedPct: true,
      downloadedAt: true,
      startedAt: true,
      documentId: true,
      document: { select: { name: true } },
      dataroom: { select: { name: true } },
    },
  });

  type Agg = {
    email: string;
    viewerId: string | null;
    visits: number;
    totalTime: number;
    maxCompletion: number;
    downloads: number;
    lastSeen: Date;
    // item name -> number of views, to find the most-revisited item
    perItem: Map<string, number>;
  };
  const byEmail = new Map<string, Agg>();

  for (const v of views) {
    const email = v.viewerEmail as string;
    const itemName = v.document?.name ?? v.dataroom?.name ?? "a document";
    const a =
      byEmail.get(email) ??
      ({
        email,
        viewerId: v.viewerId,
        visits: 0,
        totalTime: 0,
        maxCompletion: 0,
        downloads: 0,
        lastSeen: v.startedAt,
        perItem: new Map(),
      } satisfies Agg);
    a.visits += 1;
    a.totalTime += v.totalDuration;
    a.maxCompletion = Math.max(a.maxCompletion, v.completedPct);
    if (v.downloadedAt) a.downloads += 1;
    if (v.startedAt > a.lastSeen) a.lastSeen = v.startedAt;
    if (v.viewerId && !a.viewerId) a.viewerId = v.viewerId;
    a.perItem.set(itemName, (a.perItem.get(itemName) ?? 0) + 1);
    byEmail.set(email, a);
  }

  const leads = [...byEmail.values()].map((a): HotLead => {
    const score =
      a.totalTime +
      a.maxCompletion * 2 +
      (a.visits - 1) * 120 +
      a.downloads * 180;
    const [topItem, topCount] = [...a.perItem.entries()].sort(
      (x, y) => y[1] - x[1]
    )[0] ?? ["a document", 0];
    return {
      email: a.email,
      viewerId: a.viewerId,
      score,
      reason: reasonFor(a, topItem, topCount),
      visits: a.visits,
      totalTime: a.totalTime,
      lastSeen: a.lastSeen.toISOString(),
    };
  });

  return leads.sort((a, b) => b.score - a.score).slice(0, limit);
}

function reasonFor(
  a: { totalTime: number; maxCompletion: number; downloads: number },
  topItem: string,
  topCount: number
): string {
  const time = formatDuration(a.totalTime);
  if (topCount >= 2) return `re-read ${topItem} ${topCount}x · ${time}`;
  if (a.downloads > 0) return `downloaded ${topItem} · ${time}`;
  if (a.maxCompletion >= 80)
    return `read ${a.maxCompletion}% of ${topItem} · ${time}`;
  return `${time} on ${topItem}`;
}
