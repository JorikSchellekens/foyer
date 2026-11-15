import "server-only";
import { NextResponse } from "next/server";
import { authenticateApi, hasScope, type ApiPrincipal } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";
import type { ApiScope } from "@/lib/api-scopes";

/**
 * Admit a REST request: a valid key, the scope the route needs, and room in
 * the caller's rate limit (shared across all of one person's keys).
 */
export async function admitApi(
  req: Request,
  scope: ApiScope
): Promise<{ principal: ApiPrincipal } | { response: NextResponse }> {
  const principal = await authenticateApi(req);
  if (!principal)
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  const limited = rateLimit(
    `rest:${principal.teamId}:${principal.userId}`,
    scope === "read" ? 240 : 30,
    60_000
  );
  if (!limited.ok)
    return {
      response: NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "retry-after": String(limited.retryAfter) } }
      ),
    };
  if (!hasScope(principal, scope))
    return {
      response: NextResponse.json(
        { error: `This API key does not have the ${scope} scope.` },
        { status: 403 }
      ),
    };
  return { principal };
}
