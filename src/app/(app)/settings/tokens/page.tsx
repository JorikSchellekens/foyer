import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestOrigin } from "@/lib/origin";
import { TokensClient } from "./tokens-client";

export default async function TokensPage() {
  const ctx = await requireTeam();
  // Owners and admins oversee every key. Other members see their own: the
  // change list names rooms, documents and invited addresses that a member
  // limited to certain rooms should not learn about from here.
  const mine = ctx.role === "MEMBER" ? { userId: ctx.user.id } : {};
  const [tokens, events] = await Promise.all([
    db.apiToken.findMany({
      where: { teamId: ctx.team.id, ...mine },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }),
    db.apiTokenEvent.findMany({
      where: { teamId: ctx.team.id, ...mine },
      include: { token: { select: { partialKey: true, user: { select: { email: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <TokensClient
      mcpUrl={`${await requestOrigin()}/api/mcp/mcp`}
      seesAll={ctx.role !== "MEMBER"}
      tokens={tokens.map((t) => ({
        id: t.id,
        name: t.name,
        partialKey: t.partialKey,
        createdBy: t.user.email,
        scopes: t.scopes,
        expiresAt: t.expiresAt?.toISOString() ?? null,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      }))}
      events={events.map((e) => ({
        id: e.id,
        tokenName: e.tokenName,
        partialKey: e.token?.partialKey ?? null,
        person: e.token?.user.email ?? null,
        tool: e.tool,
        summary: e.summary,
        ok: e.ok,
        createdAt: e.createdAt.toISOString(),
      }))}
    />
  );
}
