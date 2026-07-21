import { NextRequest, NextResponse } from "next/server";
import { sendWeeklyDigests } from "@/lib/digest";

/**
 * Weekly engagement digest. Meant to be hit by a scheduler (Coolify cron,
 * GitHub Actions, cron-job.org, etc.) once a week with the shared secret:
 *
 *   curl -H "authorization: Bearer $CRON_SECRET" https://foyer.boop.it/api/cron/digest
 *
 * Refuses to run unless CRON_SECRET is set and matches, so the endpoint is not
 * publicly triggerable.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendWeeklyDigests();
  return NextResponse.json({ ok: true, ...result });
}
