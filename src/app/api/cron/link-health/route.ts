import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { runLinkHealthCheck } from "@/lib/link-health";

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Link health check: verifies every document behind a live link still has
 * viewable content and emails LINK_HEALTH_EMAILS when that changes. Hit
 * every 15 minutes by a Coolify scheduled task, same contract as
 * /api/cron/digest:
 *
 *   curl -H "authorization: Bearer $CRON_SECRET" https://data.boop.it/api/cron/link-health
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runLinkHealthCheck();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
