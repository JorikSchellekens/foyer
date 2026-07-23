import { NextRequest, NextResponse } from "next/server";
import { consumeVerificationToken } from "@/lib/tokens";
import { setPortalSession } from "@/lib/sign-session";
import { originFromRequest } from "@/lib/origin";

/** Portal magic link: proves email ownership, opens the signed-docs list. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const origin = originFromRequest(req);
  const record = await consumeVerificationToken(token, "SIGNED_PORTAL");
  if (!record)
    return NextResponse.redirect(`${origin}/signed?expired=1`);
  await setPortalSession(record.email);
  return NextResponse.redirect(`${origin}/signed`);
}
