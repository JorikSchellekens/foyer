import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestOrigin } from "@/lib/origin";
import { TokensClient } from "./tokens-client";

export default async function TokensPage() {
  const ctx = await requireTeam();
  const tokens = await db.apiToken.findMany({
    where: { teamId: ctx.team.id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <TokensClient
      mcpUrl={`${await requestOrigin()}/api/mcp/mcp`}
      tokens={tokens.map((t) => ({
        id: t.id,
        name: t.name,
        partialKey: t.partialKey,
        createdBy: t.user.email,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
