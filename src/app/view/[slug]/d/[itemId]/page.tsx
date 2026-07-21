import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  evaluateAccess,
  getViewerSession,
  itemGrant,
  resolveLink,
} from "@/lib/access";
import { ensureView } from "@/lib/view-session";
import { resolveBranding, gateBrand } from "@/lib/viewer-brand";
import { fetchNotionPage } from "@/lib/notion";
import { db } from "@/lib/db";
import {
  DocumentViewer,
  type ViewerDoc,
} from "@/components/viewer/document-viewer";

export default async function DataroomDocumentPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}) {
  const { slug, itemId } = await params;
  const h = await headers();
  const host = h.get("host") ?? "";
  const link = await resolveLink(host, slug);
  if (!link || link.target !== "DATAROOM" || !link.dataroom) notFound();

  const session = await getViewerSession(link.id);
  const access = evaluateAccess(link, session);
  if (access.kind !== "granted") redirect(`/view/${slug}`);

  const item = link.dataroom.documents.find((d) => d.id === itemId);
  if (!item) notFound();
  const grant = itemGrant(link, "DATAROOM_DOCUMENT", item.id);
  if (!grant.canView) redirect(`/view/${slug}`);

  const doc = await db.document.findUnique({
    where: { id: item.documentId },
    include: { currentVersion: true },
  });
  if (!doc) notFound();

  const { viewId, trackToken } = await ensureView(link, session, {
    documentId: doc.id,
  });

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
      ? `/api/view/file/${version.id}?slug=${slug}`
      : null,
    downloadUrl:
      grant.canDownload && version?.fileKey
        ? `/api/view/file/${version.id}?slug=${slug}&download=1`
        : null,
    recordMap,
  };

  return (
    <DocumentViewer
      doc={viewerDoc}
      viewId={viewId}
      trackToken={trackToken}
      brand={{
        teamName: link.team.name,
        brandColor: brand.brandColor,
        logoUrl: brand.logoUrl,
        ctaLabel: branding?.ctaLabel ?? null,
        ctaUrl: branding?.ctaUrl ?? null,
      }}
      watermarkText={link.watermark ? (session.email ?? "confidential") : null}
      protection={link.screenshotProtection}
      backHref={`/view/${slug}`}
    />
  );
}
