import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  evaluateAccess,
  getViewerSession,
  resolveLink,
  verifyPreviewToken,
} from "@/lib/access";
import { ensureView } from "@/lib/view-session";
import { resolveBranding, gateBrand } from "@/lib/viewer-brand";
import { fetchNotionPage } from "@/lib/notion";
import {
  DocumentViewer,
  type ViewerDoc,
} from "@/components/viewer/document-viewer";
import { DataroomIndex } from "./dataroom-index";
import { AccessGate } from "./access-gate";
import { linkMetadata } from "./link-metadata";

async function load(slug: string) {
  const h = await headers();
  const host = h.get("host") ?? "";
  return resolveLink(host, slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return linkMetadata(slug);
}

export default async function ViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ folder?: string; preview?: string }>;
}) {
  const { slug } = await params;
  const { folder, preview } = await searchParams;
  const link = await load(slug);
  if (!link) notFound();

  const branding = await resolveBranding(link);
  const brand = gateBrand(link, branding);
  const session = await getViewerSession(link.id);
  const isPreview = await verifyPreviewToken(preview, link.id);

  if (!isPreview) {
    const access = evaluateAccess(link, session);
    if (access.kind !== "granted")
      return (
        <AccessGate
          access={access}
          link={link}
          slug={slug}
          brand={brand}
          session={session}
        />
      );
  }

  // granted (or an owner preview, which records nothing)
  const { viewId, trackToken } = isPreview
    ? { viewId: "", trackToken: "" }
    : await ensureView(link, session);
  const previewSuffix = isPreview
    ? `&preview=${encodeURIComponent(preview!)}`
    : "";

  if (link.target === "DOCUMENT" && link.document) {
    const doc = link.document;
    // A link document has nothing to render: the view is recorded above,
    // then the visitor goes straight to the URL.
    if (doc.type === "LINK") {
      if (!doc.externalUrl) notFound();
      redirect(doc.externalUrl);
    }
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
        link.allowDownload && version?.fileKey
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
        watermarkText={
          link.watermark ? (session.email ?? "confidential") : null
        }
        protection={link.screenshotProtection}
        backHref={null}
        claimSession
      />
    );
  }

  if (link.target === "DATAROOM" && link.dataroom) {
    return (
      <DataroomIndex
        link={link}
        slug={slug}
        branding={branding}
        brand={brand}
        session={session}
        viewId={viewId}
        trackToken={trackToken}
        currentFolderId={folder ?? null}
        previewToken={isPreview ? preview! : null}
      />
    );
  }

  notFound();
}
