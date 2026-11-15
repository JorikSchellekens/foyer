import "server-only";
import { db } from "@/lib/db";
import type { ApiPrincipal } from "@/lib/api-auth";

/**
 * Record one change made with an API key. Read by the owner on the API keys
 * settings page. Never throws: a failed audit write must not turn a change
 * that already happened into an error for the caller.
 */
export async function recordApiEvent(
  principal: Pick<ApiPrincipal, "teamId" | "tokenId" | "tokenName" | "userId">,
  event: { tool: string; summary: string; ok?: boolean }
) {
  try {
    await db.apiTokenEvent.create({
      data: {
        teamId: principal.teamId,
        tokenId: principal.tokenId,
        tokenName: principal.tokenName,
        userId: principal.userId,
        tool: event.tool.slice(0, 80),
        // Control and direction-override characters would let a crafted
        // name forge or reorder text in the activity list.
        summary: event.summary
          .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, " ")
          .slice(0, 2000),
        ok: event.ok ?? true,
      },
    });
  } catch (e) {
    console.error("[api-audit] failed to record event", e);
  }
}
