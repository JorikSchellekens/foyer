import "server-only";
import { db } from "@/lib/db";
import { hashApiKey } from "@/lib/tokens";

/** Bearer-token auth for the REST API and CLI. */
export async function authenticateApi(
  req: Request
): Promise<{ teamId: string; userId: string } | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const key = header.slice(7).trim();
  const token = await db.apiToken.findUnique({
    where: { hashedKey: hashApiKey(key) },
  });
  if (!token) return null;
  db.apiToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { teamId: token.teamId, userId: token.userId };
}
