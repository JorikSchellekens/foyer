import { NextRequest, NextResponse } from "next/server";
import { getTeamContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrRenderThumb } from "@/lib/thumbnails";

/** Serves a precomputed PDF page thumbnail to signed-in team members. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ versionId: string; page: string }> }
) {
  const ctx = await getTeamContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { versionId, page } = await params;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1 || n > 10_000)
    return NextResponse.json({ error: "Bad page" }, { status: 400 });

  const version = await db.documentVersion.findFirst({
    where: { id: versionId, document: { teamId: ctx.team.id } },
    include: { document: { select: { type: true } } },
  });
  if (!version || version.document?.type !== "PDF")
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const buf = await getOrRenderThumb(versionId, n);
    if (!buf)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": "image/webp",
        // thumbnails never change for a given version id
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
