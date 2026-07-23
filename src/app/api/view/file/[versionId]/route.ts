import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  evaluateAccess,
  getViewerSession,
  itemGrant,
  resolveLink,
  verifyPreviewToken,
} from "@/lib/access";
import { streamObject } from "@/lib/object-response";

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
  const isPreview = await verifyPreviewToken(
    req.nextUrl.searchParams.get("preview"),
    link.id
  );
  if (!isPreview && evaluateAccess(link, session).kind !== "granted")
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
    if (session.viewId) {
      await db.view
        .update({
          where: { id: session.viewId },
          data: { downloadedAt: new Date() },
        })
        .catch(() => {});
    }
    return streamObject(version.fileKey, version.contentType, {
      disposition: `attachment; filename="${encodeURIComponent(version.fileName)}"`,
    });
  }

  // The object store is private and internal, so all bytes stream through
  // the app.
  return streamObject(version.fileKey, version.contentType, {
    disposition: "inline",
    range: req.headers.get("range"),
  });
}
