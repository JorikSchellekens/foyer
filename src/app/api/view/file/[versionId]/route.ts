import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  evaluateAccess,
  getViewerSession,
  itemGrant,
  resolveLink,
} from "@/lib/access";
import { getObjectStream, presignDownload } from "@/lib/storage";

/**
 * Serves document bytes to a granted viewer session.
 * ?slug=<slug> identifies the link; ?download=1 asks for an attachment.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const { versionId } = await params;
  const slug = req.nextUrl.searchParams.get("slug");
  const wantsDownload = req.nextUrl.searchParams.get("download") === "1";
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const host = req.headers.get("host") ?? "";
  const link = await resolveLink(host, slug);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getViewerSession(link.id);
  const access = evaluateAccess(link, session);
  if (access.kind !== "granted")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const version = await db.documentVersion.findUnique({
    where: { id: versionId },
    include: { document: true },
  });
  if (!version?.fileKey || version.document.teamId !== link.teamId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Version must be reachable through this link.
  let canDownload = link.allowDownload;
  if (link.target === "DOCUMENT") {
    if (version.documentId !== link.documentId)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else {
    const item = link.dataroom?.documents.find(
      (d) => d.documentId === version.documentId
    );
    if (!item)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const grant = itemGrant(link, "DATAROOM_DOCUMENT", item.id);
    if (!grant.canView)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    canDownload = grant.canDownload;
  }

  if (wantsDownload) {
    if (!canDownload)
      return NextResponse.json(
        { error: "Downloads are disabled for this link" },
        { status: 403 }
      );
    const url = await presignDownload(version.fileKey, version.fileName);
    // mark the view as having downloaded
    if (session.viewId) {
      await db.view
        .update({
          where: { id: session.viewId },
          data: { downloadedAt: new Date() },
        })
        .catch(() => {});
    }
    return NextResponse.redirect(url);
  }

  // Media streams via a short-lived presigned URL so range requests work.
  if (
    version.contentType.startsWith("video/") ||
    version.contentType.startsWith("audio/")
  ) {
    const url = await presignDownload(version.fileKey);
    return NextResponse.redirect(url);
  }

  try {
    const obj = await getObjectStream(version.fileKey);
    return new NextResponse(obj.Body!.transformToWebStream(), {
      headers: {
        "content-type": version.contentType,
        "content-disposition": "inline",
        "cache-control": "private, max-age=600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
