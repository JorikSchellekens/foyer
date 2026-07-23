import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSignerSession } from "@/lib/sign-session";
import { originFromRequest } from "@/lib/origin";

/**
 * Signer invite links: possession of the token proves the emailed invitation
 * was received. Establishes the fs_ session cookie and redirects to the
 * signing page so the token never lingers in the address bar.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const origin = originFromRequest(req);
  const signer = await db.signer.findUnique({
    where: { token },
    include: { request: true },
  });
  if (!signer || signer.request.status === "DRAFT")
    return NextResponse.redirect(`${origin}/view/expired`);

  await setSignerSession({ requestId: signer.requestId, signerId: signer.id });
  return NextResponse.redirect(`${origin}/sign/${signer.requestId}`);
}
