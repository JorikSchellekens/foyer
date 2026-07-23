import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { runSignatureCron } from "@/lib/signing";
import { originFromRequest } from "@/lib/origin";

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Signature-request sweep: expires overdue envelopes and sends scheduled
 * reminders. Hit daily by an external scheduler, same contract as
 * /api/cron/digest:
 *
 *   curl -H "authorization: Bearer $CRON_SECRET" https://foyer.boop.it/api/cron/signatures
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
  const result = await runSignatureCron(originFromRequest(req));
  return NextResponse.json({ ok: true, ...result });
}
