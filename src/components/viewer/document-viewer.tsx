"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react";
import type { ExtendedRecordMap } from "notion-types";
import dynamic from "next/dynamic";
import { useTracking } from "./use-tracking";
import { Watermark } from "./watermark";
import { NotionViewer } from "./notion-viewer";
import { PreviewBanner } from "./preview-banner";
import { DocumentLoading } from "./document-loading";

// pdf.js touches DOM globals at module scope; only load it in the browser
const PdfViewer = dynamic(
  () => import("./pdf-viewer").then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => <DocumentLoading />,
  }
);
import {
  AudioViewer,
  DocxViewer,
  ImageViewer,
  SheetViewer,
  TextViewer,
  VideoViewer,
} from "./simple-viewers";

export type ViewerBrand = {
  teamName: string;
  brandColor: string;
  logoUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

export type ViewerDoc = {
  name: string;
  type:
    | "PDF"
    | "IMAGE"
    | "VIDEO"
    | "AUDIO"
    | "DOCX"
    | "SHEET"
    | "TEXT"
    | "NOTION"
    | "OTHER";
  versionId: string | null;
  numPages: number | null;
  fileUrl: string | null;
  downloadUrl: string | null;
  recordMap?: ExtendedRecordMap | null;
};

export function DocumentViewer({
  doc,
  viewId,
  trackToken,
  brand,
  watermarkText,
  protection,
  backHref,
  claimSession = false,
  preview = false,
  prevHref = null,
  nextHref = null,
  position = null,
}: {
  doc: ViewerDoc;
  viewId: string;
  trackToken: string;
  brand: ViewerBrand;
  watermarkText: string | null;
  protection: boolean;
  backHref: string | null;
  claimSession?: boolean;
  preview?: boolean;
  prevHref?: string | null;
  nextHref?: string | null;
  position?: string | null;
}) {
  const { setPage, containerRef, notifyDownload } = useTracking({
    viewId,
    token: trackToken,
    versionId: doc.versionId,
    numPages: doc.type === "PDF" ? doc.numPages : 1,
    claimSession,
    preview,
  });

  const onPageChange = useCallback(
    (page: number) => setPage(page),
    [setPage]
  );

  useEffect(() => {
    if (!protection) return;
    const stop = (e: Event) => e.preventDefault();
    const stopKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && ["p", "s", "c"].includes(e.key.toLowerCase()))
        e.preventDefault();
    };
    document.addEventListener("contextmenu", stop);
    document.addEventListener("copy", stop);
    document.addEventListener("keydown", stopKeys);
    return () => {
      document.removeEventListener("contextmenu", stop);
      document.removeEventListener("copy", stop);
      document.removeEventListener("keydown", stopKeys);
    };
  }, [protection]);

  return (
    <div
      className={`flex h-screen flex-col bg-[#101418] ${
        protection ? "protected-content" : ""
      }`}
    >
      {preview && <PreviewBanner />}
      <header className="z-40 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0c1013] px-4 text-white">
        {backHref && (
          <Link
            href={backHref}
            className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            title="Back to index"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.teamName}
            className="h-7 w-auto max-w-28 rounded-sm object-contain"
          />
        ) : (
          <span
            className="flex size-7 items-center justify-center rounded font-mono text-xs font-bold text-white"
            style={{ backgroundColor: brand.brandColor }}
          >
            {brand.teamName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.name}</p>
          <p className="truncate text-[11px] text-white/50">
            {brand.teamName}
          </p>
        </div>
        {position && (
          <div className="flex items-center gap-1 text-white/70">
            {prevHref ? (
              <Link
                href={prevHref}
                className="rounded-md p-1.5 hover:bg-white/10 hover:text-white"
                title="Previous document"
              >
                <ChevronLeft className="size-4" />
              </Link>
            ) : (
              <span className="p-1.5 opacity-30">
                <ChevronLeft className="size-4" />
              </span>
            )}
            <span className="min-w-14 text-center font-mono text-[11px] tabular">
              {position}
            </span>
            {nextHref ? (
              <Link
                href={nextHref}
                className="rounded-md p-1.5 hover:bg-white/10 hover:text-white"
                title="Next document"
              >
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span className="p-1.5 opacity-30">
                <ChevronRight className="size-4" />
              </span>
            )}
          </div>
        )}
        {brand.ctaUrl && brand.ctaLabel && (
          <a
            href={brand.ctaUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85 sm:inline-flex"
            style={{ backgroundColor: brand.brandColor }}
          >
            {brand.ctaLabel}
            <ExternalLink className="size-3" />
          </a>
        )}
        {doc.downloadUrl && (
          <a
            href={doc.downloadUrl}
            onClick={notifyDownload}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10"
          >
            <Download className="size-3.5" /> Download
          </a>
        )}
      </header>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto">
        {watermarkText && <Watermark text={watermarkText} />}
        <Body doc={doc} onPageChange={onPageChange} protection={protection} />
      </div>
    </div>
  );
}

function Body({
  doc,
  onPageChange,
  protection,
}: {
  doc: ViewerDoc;
  onPageChange: (page: number, numPages: number) => void;
  protection: boolean;
}) {
  if (doc.type === "NOTION" && doc.recordMap)
    return <NotionViewer recordMap={doc.recordMap} />;
  if (!doc.fileUrl)
    return (
      <p className="py-24 text-center text-sm text-white/60">
        This document has no viewable content.
      </p>
    );
  switch (doc.type) {
    case "PDF":
      return (
        <PdfViewer
          fileUrl={doc.fileUrl}
          onPageChange={onPageChange}
          protection={protection}
        />
      );
    case "IMAGE":
      return <ImageViewer fileUrl={doc.fileUrl} name={doc.name} />;
    case "VIDEO":
      return <VideoViewer fileUrl={doc.fileUrl} allowDownload={!!doc.downloadUrl} />;
    case "AUDIO":
      return <AudioViewer fileUrl={doc.fileUrl} name={doc.name} />;
    case "DOCX":
      return <DocxViewer fileUrl={doc.fileUrl} />;
    case "SHEET":
      return <SheetViewer fileUrl={doc.fileUrl} />;
    case "TEXT":
      return <TextViewer fileUrl={doc.fileUrl} />;
    default:
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/70">
          <p className="text-sm">
            Preview is not available for this file type.
          </p>
          {doc.downloadUrl && (
            <a
              href={doc.downloadUrl}
              className="rounded-md border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
            >
              Download the file
            </a>
          )}
        </div>
      );
  }
}
