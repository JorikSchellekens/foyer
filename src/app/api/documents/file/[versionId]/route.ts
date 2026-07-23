import { NextRequest, NextResponse } from "next/server";
import { getTeamContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { streamObject } from "@/lib/object-response";

/**
 * Serves document bytes to signed-in team members (dashboard and internal
 * previews). No link, no viewer session, nothing recorded. Honours Range
 * (pdf.js chunking, media seeking); ?download=1 asks for an attachment.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const ctx = await getTeamContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { versionId } = await params;
  const version = await db.documentVersion.findFirst({
    where: { id: versionId, document: { teamId: ctx.team.id } },
  });
  if (!version?.fileKey)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (req.nextUrl.searchParams.get("download") === "1")
    return streamObject(version.fileKey, version.contentType, {
      disposition: `attachment; filename="${encodeURIComponent(version.fileName)}"`,
    });

  return streamObject(version.fileKey, version.contentType, {
    disposition: "inline",
    range: req.headers.get("range"),
  });
}
