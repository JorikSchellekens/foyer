import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSignerSession, getPortalEmail } from "@/lib/sign-session";
import { getTeamContext } from "@/lib/auth";
import { streamObject } from "@/lib/object-response";

/**
 * Serves the completed (stamped + certificate) PDF. Authorized by a signer/CC
 * session for this request, an email-verified portal session belonging to one
 * of its recipients, or a signed-in member of the owning team - completion
 * email links, the /signed portal, and the dashboard all share this route.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  const request = await db.signatureRequest.findUnique({
    where: { id: requestId },
    include: { signers: { select: { email: true } } },
  });
  if (!request?.signedFileKey)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getSignerSession(requestId);
  if (!session) {
    const portalEmail = await getPortalEmail();
    const isRecipient =
      !!portalEmail && request.signers.some((s) => s.email === portalEmail);
    if (!isRecipient) {
      const ctx = await getTeamContext();
      if (!ctx || ctx.team.id !== request.teamId)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const filename = `${request.title.replace(/[^\w .-]+/g, "_")} (signed).pdf`;
  return streamObject(request.signedFileKey, "application/pdf", {
    disposition:
      req.nextUrl.searchParams.get("download") === "1"
        ? `attachment; filename="${encodeURIComponent(filename)}"`
        : "inline",
    range: req.headers.get("range"),
  });
}
