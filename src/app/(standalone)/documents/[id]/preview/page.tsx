import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchNotionPage } from "@/lib/notion";
import {
  DocumentViewer,
  type ViewerDoc,
} from "@/components/viewer/document-viewer";

/**
 * Internal quick-look at any library document: no link, no viewer session,
 * nothing recorded. ?version=<versionId> previews an older version.
 */
export default async function DocumentPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const ctx = await requireTeam();
  const { id } = await params;
  const { version: versionParam } = await searchParams;

  const doc = await db.document.findFirst({
    where: { id, teamId: ctx.team.id },
    include: { currentVersion: true, versions: true },
  });
  if (!doc) notFound();

  const version =
    (versionParam && doc.versions.find((v) => v.id === versionParam)) ||
    doc.currentVersion;

  const branding = await db.branding.findFirst({
    where: { teamId: ctx.team.id, dataroomId: null },
  });

  const recordMap =
    doc.type === "NOTION" && doc.externalUrl
      ? await fetchNotionPage(doc.externalUrl)
      : null;

  const viewerDoc: ViewerDoc = {
    name: doc.name,
    type: doc.type,
    versionId: version?.id ?? null,
    numPages: version?.numPages ?? null,
    fileUrl: version?.fileKey ? `/api/documents/file/${version.id}` : null,
    downloadUrl: version?.fileKey
      ? `/api/documents/file/${version.id}?download=1`
      : null,
    recordMap,
  };

  const isOldVersion = !!version && version.id !== doc.currentVersionId;

  return (
    <DocumentViewer
      doc={viewerDoc}
      viewId=""
      trackToken=""
      preview
      previewText={
        isOldVersion
          ? `Internal preview of version ${version.versionNumber} - nothing is recorded.`
          : "Internal preview - nothing is recorded."
      }
      brand={{
        teamName: ctx.team.name,
        brandColor: branding?.brandColor ?? "#175B47",
        logoUrl: branding?.logoKey ? `/api/assets/${branding.logoKey}` : null,
        ctaLabel: null,
        ctaUrl: null,
      }}
      watermarkText={null}
      protection={false}
      backHref={`/documents/${doc.id}`}
    />
  );
}
