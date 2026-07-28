import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { appHost } from "@/lib/cloudflare";
import type { ImportPlan } from "@/lib/papermark/scan";
import type { ImportOptions } from "@/lib/papermark/run";
import { ImportClient } from "./import-client";

export const metadata = { title: "Import" };

export default async function ImportPage() {
  const ctx = await requireTeam();

  // The active import is whatever has not been dismissed; finished-and-
  // dismissed runs stay in the database as receipts but leave the screen.
  const active = await db.import.findFirst({
    where: { teamId: ctx.team.id, dismissedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const past = await db.import.findMany({
    where: { teamId: ctx.team.id, dismissedAt: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Item rows drive the review/receipt tables. Only fetched once a run has
  // actually produced some, so the connect screen stays a single query.
  const items = active
    ? await db.importItem.findMany({
        where: { importId: active.id },
        orderBy: [{ sortOrder: "asc" }, { externalName: "asc" }],
        select: {
          id: true,
          kind: true,
          status: true,
          externalId: true,
          externalName: true,
          localId: true,
          error: true,
        },
      })
    : [];

  const existingDomains = await db.domain.findMany({
    where: { teamId: ctx.team.id },
    select: { domain: true, status: true },
  });

  return (
    <ImportClient
      canManage={ctx.role === "OWNER" || ctx.role === "ADMIN"}
      // The DNS target is the configured app host, not the host this request
      // happened to arrive on - and computing it on the server keeps the
      // markup identical between server and client render.
      appHost={appHost()}
      existingDomains={existingDomains}
      active={
        active && {
          id: active.id,
          status: active.status,
          activity: active.activity,
          error: active.error,
          total: active.totalItems,
          done: active.doneItems,
          failed: active.failedItems,
          sourceTeamId: active.sourceTeamId,
          hasCookie: Boolean(active.cookieCipher),
          rootFolderId: active.rootFolderId,
          createdAt: active.createdAt.toISOString(),
          completedAt: active.completedAt?.toISOString() ?? null,
          plan: active.plan as unknown as ImportPlan | null,
          options: active.options as unknown as ImportOptions | null,
        }
      }
      items={items}
      past={past.map((p) => ({
        id: p.id,
        createdAt: p.createdAt.toISOString(),
        done: p.doneItems,
        failed: p.failedItems,
      }))}
    />
  );
}
