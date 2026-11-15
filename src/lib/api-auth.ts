import "server-only";
import { db } from "@/lib/db";
import { hashApiKey } from "@/lib/tokens";
import { normalizeScopes, type ApiScope } from "@/lib/api-scopes";
import type { TeamContext } from "@/lib/auth";
import type { ApiToken } from "@prisma/client";

/**
 * Who a request made with an API key is acting as. A key never has more
 * access than the person who created it has right now: `ctx` is their live
 * membership, so their role and data room permissions apply to every call.
 */
export type ApiPrincipal = {
  tokenId: string;
  tokenName: string;
  teamId: string;
  userId: string;
  scopes: ApiScope[];
  expiresAt: Date | null;
  ctx: TeamContext;
};

/**
 * Resolve an API key. Returns null when the key is unknown, has expired, or
 * belongs to someone who is no longer a member of the team it was made for.
 */
export async function resolveApiKey(
  key: string | null | undefined
): Promise<ApiPrincipal | null> {
  // Every key starts with "foyer_"; anything else cannot match, so skip the
  // lookup rather than hash arbitrary input.
  if (!key || key.length > 200 || !key.startsWith("foyer_")) return null;
  const token = await db.apiToken.findUnique({
    where: { hashedKey: hashApiKey(key) },
  });
  return token ? principalFor(token, true) : null;
}

/**
 * The same checks for a key identified by its id, for work that continues
 * after the call that presented the key (a pending upload).
 */
export async function resolveApiTokenId(
  tokenId: string
): Promise<ApiPrincipal | null> {
  const token = await db.apiToken.findUnique({ where: { id: tokenId } });
  return token ? principalFor(token, false) : null;
}

async function principalFor(
  token: ApiToken,
  touch: boolean
): Promise<ApiPrincipal | null> {
  if (token.expiresAt && token.expiresAt <= new Date()) return null;

  const member = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId: token.teamId, userId: token.userId } },
    include: { team: true, user: true },
  });
  if (!member) return null;

  // Touch lastUsedAt at most once a minute: it is a hint for the settings
  // page, not worth a write on every call.
  if (
    touch &&
    (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60_000)
  ) {
    db.apiToken
      .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  const { team, user, ...memberRow } = member;
  return {
    tokenId: token.id,
    tokenName: token.name,
    teamId: token.teamId,
    userId: token.userId,
    scopes: normalizeScopes(token.scopes),
    expiresAt: token.expiresAt,
    ctx: { user, team, member: memberRow, role: member.role },
  };
}

export function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header || !/^Bearer /i.test(header)) return null;
  return header.slice(7).trim() || null;
}

/** Bearer-key auth for the REST API. */
export async function authenticateApi(
  req: Request
): Promise<ApiPrincipal | null> {
  return resolveApiKey(bearerFrom(req));
}

export function hasScope(principal: ApiPrincipal, scope: ApiScope): boolean {
  return principal.scopes.includes(scope);
}
