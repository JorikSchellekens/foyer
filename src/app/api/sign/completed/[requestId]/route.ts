import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSignerSession } from "@/lib/sign-session";
import { getTeamContext } from "@/lib/auth";
import { streamObject } from "@/lib/object-response";

/**
 * Serves the completed (stamped + certificate) PDF. Authorized either by a
 * signer/CC session for this request or by a signed-in member of the owning
 * team, so the completion email links and the dashboard share one route.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  const request = await db.signatureRequest.findUnique({
    where: { id: requestId },
  });
  if (!request?.signedFileKey)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getSignerSession(requestId);
  if (!session) {
    const ctx = await getTeamContext();
    if (!ctx || ctx.team.id !== request.teamId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
