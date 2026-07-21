import { NextRequest, NextResponse } from "next/server";
import { getTeamContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";

/** Serves document bytes to signed-in team members (dashboard previews). */
export async function GET(
  _req: NextRequest,
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

  try {
    const obj = await getObjectStream(version.fileKey);
    return new NextResponse(obj.Body!.transformToWebStream(), {
      headers: {
        "content-type": version.contentType,
        "content-disposition": "inline",
        "cache-control": "private, max-age=600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
