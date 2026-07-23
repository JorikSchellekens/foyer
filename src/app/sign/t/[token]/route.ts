import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSignerSession, setPortalSession } from "@/lib/sign-session";
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
  // Token possession proves inbox access - the same anchor the /signed
  // portal's magic link uses - so open the portal session here too, making
  // "everything I've signed" reachable with no extra verification step.
  await setPortalSession(signer.email);
  return NextResponse.redirect(`${origin}/sign/${signer.requestId}`);
}
