import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { WebhooksClient } from "./webhooks-client";

export default async function WebhooksPage() {
  const ctx = await requireTeam();
  const hooks = await db.webhook.findMany({
    where: { teamId: ctx.team.id },
    include: {
      deliveries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <WebhooksClient
      hooks={hooks.map((h) => ({
        id: h.id,
        url: h.url,
        secret: h.secret,
        events: h.events,
        active: h.active,
        deliveries: h.deliveries.map((d) => ({
          id: d.id,
          event: d.event,
          statusCode: d.statusCode,
          error: d.error,
          createdAt: d.createdAt.toISOString(),
        })),
      }))}
    />
  );
}
