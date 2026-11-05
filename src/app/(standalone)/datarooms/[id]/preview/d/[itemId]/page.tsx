import { notFound, redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { canAccessDataroom } from "@/lib/permissions";
import {
  internalDataroomLink,
  INTERNAL_PREVIEW_TEXT,
} from "@/lib/internal-preview";
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

/**
 * One document inside the internal data room preview: the visitor viewer,
 * with the room's contents beside it and prev/next through the room, served
 * from the team's own file route and recording nothing.
 */
export default async function DataroomPreviewItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const ctx = await requireTeam();
  const { id, itemId } = await params;
  if (!(await canAccessDataroom(ctx, id, "VIEW"))) notFound();
  const link = await internalDataroomLink(ctx, id);
  if (!link?.dataroom) notFound();

  const item = link.dataroom.documents.find((d) => d.id === itemId);
  if (!item) notFound();
  const doc = await db.document.findUnique({
    where: { id: item.documentId },
    include: { currentVersion: true },
  });
  if (!doc) notFound();
  if (doc.type === "LINK") {
    if (!doc.externalUrl) notFound();
    redirect(doc.externalUrl);
  }

  const docHref = (i: string) => `/datarooms/${id}/preview/d/${i}`;
  const order = viewableDocOrder(link).filter((o) => !o.isLink);
  const pos = order.findIndex((o) => o.itemId === itemId);
  const prevHref = pos > 0 ? docHref(order[pos - 1].itemId) : null;
  const nextHref =
    pos >= 0 && pos < order.length - 1 ? docHref(order[pos + 1].itemId) : null;

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
            external: n.isLink,
          }
    );

  const branding = await resolveBranding(link);
  const brand = gateBrand(link, branding);
  const version = doc.currentVersion;
  const recordMap =
    doc.type === "NOTION" && doc.externalUrl
      ? await fetchNotionPage(doc.externalUrl, { fresh: true })
      : null;

  const viewerDoc: ViewerDoc = {
    name: doc.name,
    type: doc.type,
    versionId: version?.id ?? null,
    numPages: version?.numPages ?? null,
    fileUrl: version?.fileKey ? `/api/documents/file/${version.id}` : null,
    downloadUrl: null,
    recordMap,
  };

  return (
    <DocumentViewer
      doc={viewerDoc}
      viewId=""
      trackToken=""
      preview
      previewText={INTERNAL_PREVIEW_TEXT}
      brand={{
        teamName: ctx.team.name,
        brandColor: brand.brandColor,
        logoUrl: brand.logoUrl,
        ctaLabel: branding?.ctaLabel ?? null,
        ctaUrl: branding?.ctaUrl ?? null,
      }}
      watermarkText={null}
      protection={false}
      backHref={`/datarooms/${id}/preview`}
      prevHref={prevHref}
      nextHref={nextHref}
      position={pos >= 0 ? `${pos + 1} / ${order.length}` : null}
      tree={toViewerTree(viewableTree(link))}
      currentItemId={itemId}
    />
  );
}
