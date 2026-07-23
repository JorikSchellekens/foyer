import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSignerSession } from "@/lib/sign-session";
import { streamObject } from "@/lib/object-response";

/**
 * Serves the pinned document version to a signer with a valid fs_ session.
 * Always the pinned version: what the signer sees must be exactly what gets
 * stamped, even if the team uploads a newer version meanwhile.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  const session = await getSignerSession(requestId);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await db.signatureRequest.findUnique({
    where: { id: requestId },
    include: { version: true },
  });
  if (!request || request.status === "DRAFT" || !request.version.fileKey)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return streamObject(request.version.fileKey, "application/pdf", {
    disposition: "inline",
    range: req.headers.get("range"),
  });
}
