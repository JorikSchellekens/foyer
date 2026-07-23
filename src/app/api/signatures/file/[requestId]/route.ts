import { NextRequest, NextResponse } from "next/server";
import { getTeamContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestPdfKey } from "@/lib/signing";
import { streamObject } from "@/lib/object-response";

/**
 * Serves a signature request's pinned PDF (the rendition for non-PDF source
 * documents) to signed-in members of the owning team - the field editor's
 * document source.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const ctx = await getTeamContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestId } = await params;
  const request = await db.signatureRequest.findFirst({
    where: { id: requestId, teamId: ctx.team.id },
    include: { version: true },
  });
  const key = request && requestPdfKey(request);
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return streamObject(key, "application/pdf", {
    disposition: "inline",
    range: req.headers.get("range"),
  });
}
