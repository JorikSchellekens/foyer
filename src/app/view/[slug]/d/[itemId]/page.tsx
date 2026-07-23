import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  evaluateAccess,
  getViewerSession,
  itemGrant,
  resolveLink,
  verifyPreviewToken,
} from "@/lib/access";
import { ensureView } from "@/lib/view-session";
import {
  viewableDocOrder,
  viewableTree,
  type NavTreeNode,
} from "@/lib/dataroom-nav";
import type { ViewerTreeNode } from "@/components/viewer/dataroom-tree";
import { resolveBranding, gateBrand } from "@/lib/viewer-brand";
import { fetchNotionPage } from "@/lib/notion";
import { db } from "@/lib/db";
import {
  DocumentViewer,
  type ViewerDoc,
} from "@/components/viewer/document-viewer";

export default async function DataroomDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; itemId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug, itemId } = await params;
  const { preview } = await searchParams;
  const h = await headers();
  const host = h.get("host") ?? "";
  const link = await resolveLink(host, slug);
  if (!link || link.target !== "DATAROOM" || !link.dataroom) notFound();

  const session = await getViewerSession(link.id);
  const isPreview = await verifyPreviewToken(preview, link.id);
  const previewSuffix = isPreview
    ? `&preview=${encodeURIComponent(preview!)}`
    : "";
  const backHref = isPreview
    ? `/view/${slug}?preview=${encodeURIComponent(preview!)}`
    : `/view/${slug}`;

  if (!isPreview) {
    const access = evaluateAccess(link, session);
    if (access.kind !== "granted") redirect(`/view/${slug}`);
  }

  const item = link.dataroom.documents.find((d) => d.id === itemId);
  if (!item) notFound();
  const grant = itemGrant(link, "DATAROOM_DOCUMENT", item.id);
  if (!grant.canView) redirect(backHref);

  const doc = await db.document.findUnique({
    where: { id: item.documentId },
    include: { currentVersion: true },
  });
  if (!doc) notFound();

  const { viewId, trackToken } = isPreview
    ? { viewId: "", trackToken: "" }
    : await ensureView(link, session, { documentId: doc.id });

  // Prev/next within the visitor-visible document order, so readers move
  // through the data room without returning to the index each time.
  const order = viewableDocOrder(link);
  const pos = order.findIndex((o) => o.itemId === itemId);
  const docHref = (id: string) =>
    isPreview
      ? `/view/${slug}/d/${id}?preview=${encodeURIComponent(preview!)}`
      : `/view/${slug}/d/${id}`;
  const prevHref = pos > 0 ? docHref(order[pos - 1].itemId) : null;
  const nextHref =
    pos >= 0 && pos < order.length - 1 ? docHref(order[pos + 1].itemId) : null;
  const position = pos >= 0 ? `${pos + 1} / ${order.length}` : null;

  // explorer sidebar: the same grant-filtered tree as the index page
  const toViewerTree = (nodes: NavTreeNode[]): ViewerTreeNode[] =>
    nodes.map((n) =>
      n.kind === "folder"
        ? {
            kind: "folder",
            id: n.id,
            name: n.name,
            children: toViewerTree(n.children),
          }
        : {
            kind: "document",
            itemId: n.itemId,
            name: n.name,
            href: docHref(n.itemId),
          }
    );
  const tree = toViewerTree(viewableTree(link));

  const branding = await resolveBranding(link);
  const brand = gateBrand(link, branding);
  const version = doc.currentVersion;
  const recordMap =
    doc.type === "NOTION" && doc.externalUrl
      ? await fetchNotionPage(doc.externalUrl)
      : null;

  const viewerDoc: ViewerDoc = {
    name: doc.name,
    type: doc.type,
    versionId: version?.id ?? null,
    numPages: version?.numPages ?? null,
    fileUrl: version?.fileKey
      ? `/api/view/file/${version.id}?slug=${slug}${previewSuffix}`
      : null,
    downloadUrl:
      grant.canDownload && version?.fileKey
        ? `/api/view/file/${version.id}?slug=${slug}&download=1${previewSuffix}`
        : null,
    recordMap,
  };

  return (
    <DocumentViewer
      doc={viewerDoc}
      viewId={viewId}
      trackToken={trackToken}
      preview={isPreview}
      brand={{
        teamName: link.team.name,
        brandColor: brand.brandColor,
        logoUrl: brand.logoUrl,
        ctaLabel: branding?.ctaLabel ?? null,
        ctaUrl: branding?.ctaUrl ?? null,
      }}
      watermarkText={link.watermark ? (session.email ?? "confidential") : null}
      protection={link.screenshotProtection}
      backHref={backHref}
      prevHref={prevHref}
      nextHref={nextHref}
      position={position}
      tree={tree}
      currentItemId={itemId}
    />
  );
}
