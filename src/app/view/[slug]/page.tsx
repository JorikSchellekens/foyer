import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
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
  AgreementGate,
  BlockedGate,
  EmailGate,
  ExpiredGate,
  PasswordGate,
  VerifySentGate,
} from "@/components/viewer/gates";
import {
  DocumentViewer,
  type ViewerDoc,
} from "@/components/viewer/document-viewer";
import { DataroomIndex } from "./dataroom-index";

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
  const link = await load(slug);
  if (!link) return { title: "Not found" };
  const branding = await resolveBranding(link);
  // Preview resolution: link's own fields → link's preview preset →
  // the team's default preview preset → branding → sensible fallback.
  const defaultPreset =
    link.previewPreset ??
    (await db.previewPreset.findFirst({
      where: { teamId: link.teamId, isDefault: true },
    }));
  const title =
    link.metaTitle ??
    defaultPreset?.metaTitle ??
    branding?.metaTitle ??
    `${link.document?.name ?? link.dataroom?.name ?? "Shared documents"} · ${link.team.name}`;
  const description =
    link.metaDescription ??
    defaultPreset?.metaDescription ??
    branding?.metaDescription ??
    `${link.team.name} shared this with you via Foyer.`;
  const imageKey =
    link.metaImageKey ??
    defaultPreset?.metaImageKey ??
    branding?.metaImageKey;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: {
      title,
      description,
      ...(imageKey ? { images: [`/api/assets/${imageKey}`] } : {}),
    },
    twitter: { card: imageKey ? "summary_large_image" : "summary" },
  };
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
    switch (access.kind) {
      case "expired":
        return <ExpiredGate brand={brand} />;
      case "blocked":
        return (
          <BlockedGate
            slug={slug}
            brand={brand}
            reason={access.reason}
            defaultEmail={session.email ?? ""}
          />
        );
      case "password":
        return <PasswordGate slug={slug} brand={brand} />;
      case "email":
        return (
          <EmailGate
            slug={slug}
            brand={brand}
            requireVerification={access.requireVerification}
          />
        );
      case "verify-sent":
        return <VerifySentGate brand={brand} email={session.email} />;
      case "agreement":
        return (
          <AgreementGate
            slug={slug}
            brand={brand}
            agreement={{
              name: link.agreement!.name,
              type: link.agreement!.type,
              requireName: link.agreement!.requireName,
              content: link.agreement!.content,
              externalUrl: link.agreement!.externalUrl,
              fileUrl: link.agreement!.fileKey
                ? `/api/view/agreement/${slug}`
                : null,
            }}
          />
        );
    }
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
