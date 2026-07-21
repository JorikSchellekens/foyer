import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { appHost } from "@/lib/cloudflare";
import { DomainsClient } from "./domains-client";

export default async function DomainsPage() {
  const ctx = await requireTeam();
  const domains = await db.domain.findMany({
    where: { teamId: ctx.team.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <DomainsClient
      appHost={appHost()}
      hasGlobalCfToken={!!process.env.CLOUDFLARE_API_TOKEN}
      domains={domains.map((d) => ({
        id: d.id,
        domain: d.domain,
        status: d.status,
        autoConfigured: !!d.cloudflareRecordId,
        lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
      }))}
    />
  );
}
