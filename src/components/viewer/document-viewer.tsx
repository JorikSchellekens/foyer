"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  PanelLeft,
} from "lucide-react";
import type { ExtendedRecordMap } from "notion-types";
import dynamic from "next/dynamic";
import { useTracking } from "./use-tracking";
import { Watermark } from "./watermark";
import { NotionViewer } from "./notion-viewer";
import { PreviewBanner } from "./preview-banner";
import { DocumentLoading } from "./document-loading";
import { DataroomTree, type ViewerTreeNode } from "./dataroom-tree";

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

/** Quiet until touched, always reachable by keyboard: the chrome's own idiom. */
const chromeBtn =
  "rounded-md p-1.5 text-white/60 outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/40";

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
  tree = null,
  currentItemId = null,
  previewText,
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
  tree?: ViewerTreeNode[] | null;
  currentItemId?: string | null;
  previewText?: string;
}) {
  const hasTree = !!tree && tree.length > 0;
  // null = untouched: CSS opens it on large screens, keeps it closed on
  // small ones, with no post-hydration flash
  const [navOpen, setNavOpen] = useState<boolean | null>(null);
  const toggleNav = () =>
    setNavOpen(
      (v) => !(v ?? window.matchMedia("(min-width: 1024px)").matches)
    );
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

  // Escape closes the overlaying contents pane, the expected way out of it.
  useEffect(() => {
    if (navOpen !== true) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

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
      // 100dvh, not 100vh: on a phone the address bar would otherwise push the
      // reading frame below the fold and make the whole page scroll.
      className={`flex h-[100dvh] flex-col bg-[#101418] ${
        protection ? "protected-content" : ""
      }`}
    >
      {preview && <PreviewBanner text={previewText} />}
      <header className="z-40 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-[#0c1013] px-3 text-white sm:gap-3 sm:px-4">
        {hasTree && (
          <button
            type="button"
            onClick={toggleNav}
            className={chromeBtn}
            title="Toggle contents"
            aria-label="Toggle contents"
            aria-expanded={navOpen ?? undefined}
          >
            <PanelLeft className="size-4" />
          </button>
        )}
        {backHref && (
          <Link
            href={backHref}
            className={chromeBtn}
            title="Back to index"
            aria-label="Back to index"
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
          <p className="truncate text-sm font-medium leading-tight">{doc.name}</p>
          <p className="truncate text-[11px] leading-tight text-white/45">
            {brand.teamName}
          </p>
        </div>
        {position && (
          <div className="flex items-center gap-0.5 text-white/70">
            {prevHref ? (
              <Link
                href={prevHref}
                className={chromeBtn}
                title="Previous document"
                aria-label="Previous document"
              >
                <ChevronLeft className="size-4" />
              </Link>
            ) : (
              <span className="p-1.5 opacity-20" aria-hidden>
                <ChevronLeft className="size-4" />
              </span>
            )}
            <span className="min-w-14 text-center font-mono text-[11px] tabular text-white/70">
              {position}
            </span>
            {nextHref ? (
              <Link
                href={nextHref}
                className={chromeBtn}
                title="Next document"
                aria-label="Next document"
              >
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span className="p-1.5 opacity-20" aria-hidden>
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
            className="press hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white outline-none transition-opacity duration-[var(--dur-fast)] hover:opacity-85 focus-visible:ring-2 focus-visible:ring-white/60 sm:inline-flex"
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
            aria-label="Download"
            // Label drops below sm, so the target has to hold its own height.
            className="press inline-flex items-center justify-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1.5 text-xs font-medium text-white/85 outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 max-sm:size-10 max-sm:px-0 sm:px-3"
          >
            <Download className="size-3.5" />
            <span className="max-sm:hidden">Download</span>
          </a>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* On small screens the contents pane overlays the document: give it a
            scrim so tapping the page dismisses it. */}
        {hasTree && navOpen === true && (
          <button
            type="button"
            aria-label="Close contents"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 z-20 bg-black/40 duration-[var(--dur)] animate-in fade-in-0 lg:hidden"
          />
        )}
        {hasTree && navOpen !== false && (
          <aside
            aria-label="Contents"
            className={`absolute inset-y-0 left-0 z-30 w-72 shrink-0 overflow-y-auto overscroll-contain border-r border-white/10 bg-[#0c1013] p-3 shadow-[8px_0_32px_-16px_rgb(0_0_0/0.8)] lg:static lg:shadow-none ${
              navOpen === null
                ? "hidden lg:block"
                : "duration-[var(--dur)] ease-[var(--ease-out-quint)] animate-in slide-in-from-left-4 lg:animate-none"
            }`}
          >
            <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              Contents
            </p>
            <DataroomTree
              nodes={tree!}
              currentItemId={currentItemId}
              palette={{
                text: "rgba(255,255,255,0.8)",
                subtle: "rgba(255,255,255,0.45)",
                accent: "#ffffff",
                hoverBg: "rgba(255,255,255,0.08)",
                activeBg: "rgba(255,255,255,0.12)",
              }}
            />
          </aside>
        )}
        <div
          ref={containerRef}
          className="relative min-h-0 flex-1 overflow-auto"
        >
          {watermarkText && <Watermark text={watermarkText} />}
          <Body doc={doc} onPageChange={onPageChange} protection={protection} />
        </div>
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
      <p className="px-6 py-24 text-center text-sm text-white/55">
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
        <div className="reveal flex flex-col items-center justify-center gap-4 px-6 py-24 text-white/70">
          <p className="text-sm">Preview is not available for this file type.</p>
          {doc.downloadUrl && (
            <a
              href={doc.downloadUrl}
              className="press rounded-md border border-white/15 px-4 py-2 text-sm outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
            >
              Download the file
            </a>
          )}
        </div>
      );
  }
}
