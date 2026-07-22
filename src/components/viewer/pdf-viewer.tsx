"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  PanelLeft,
  Search,
  X,
  Loader2,
} from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { DocumentLoading } from "./document-loading";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

// Minimal structural view of the loaded PDF, enough to extract page text for
// search without depending on a specific pdfjs-dist type version.
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
  }>;
};

export function PdfViewer({
  fileUrl,
  onPageChange,
  protection,
}: {
  fileUrl: string;
  onPageChange: (page: number, numPages: number) => void;
  protection: boolean;
}) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [frame, setFrame] = useState({ w: 800, h: 600 });
  // Page aspect ratio (height / width) of the loaded document, so we can size
  // the page to fill the frame rather than a fixed cap.
  const [aspect, setAspect] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showThumbs, setShowThumbs] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PdfDoc | null>(null);
  const pageTextRef = useRef<Map<number, string>>(new Map());

  // Re-run when the document finishes loading: the frame element only exists
  // once <Document> renders its children (during loading it shows the loader),
  // so an effect that ran only on mount would attach to nothing and leave the
  // page stuck at the initial default width. Measuring immediately (not just on
  // resize) makes the first render fill the frame.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [numPages]);

  const go = useCallback(
    (next: number) => {
      if (!numPages) return;
      const clamped = Math.min(Math.max(next, 1), numPages);
      setPage(clamped);
      onPageChange(clamped, numPages);
    },
    [numPages, onPageChange]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Do not hijack arrows/space while typing in the search box.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ")
        go(page + 1);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page]);

  const zoomBy = (delta: number) =>
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))));

  // Jump to the next page (after the current one, wrapping) whose text contains
  // the query. Text is extracted lazily and cached.
  async function runSearch() {
    const q = query.trim().toLowerCase();
    if (!q || !pdfRef.current) return;
    const pdf = pdfRef.current;
    setSearchMsg("Searching…");
    const order: number[] = [];
    for (let i = 0; i < numPages; i++) {
      order.push(((page - 1 + i) % numPages) + 1);
    }
    for (const p of order) {
      let text = pageTextRef.current.get(p);
      if (text === undefined) {
        const pg = await pdf.getPage(p);
        const content = await pg.getTextContent();
        text = content.items
          .map((it) => ("str" in it ? it.str : ""))
          .join(" ")
          .toLowerCase();
        pageTextRef.current.set(p, text);
      }
      if (text.includes(q)) {
        go(p);
        setSearchMsg(`Found on page ${p}`);
        return;
      }
    }
    setSearchMsg("No matches");
  }

  // Fit to width: fill the frame horizontally (capped so an ultrawide monitor
  // does not produce a blurry, oversized canvas). This fills the screen for a
  // landscape deck AND a portrait document - the latter simply scrolls
  // vertically, the standard reading experience. Zoom scales up from there.
  const H_PAD = 40; // horizontal breathing room
  const MAX_W = 1600;
  const baseWidth = Math.min(frame.w - H_PAD, MAX_W);
  const renderWidth = Math.round(Math.max(320, baseWidth) * zoom);
  // Page height for the loading placeholder, so it holds the page's shape.
  const placeholderHeight = aspect
    ? Math.round(renderWidth * aspect)
    : Math.round(renderWidth * 1.294);

  // Keep a small window of pages mounted - previous, current, next - so a page
  // turn reveals an already-rasterised canvas instead of re-rendering (and
  // often re-fetching bytes) from scratch. Reading is mostly forward, so
  // pre-rendering the next page removes the wait for the common case, and
  // holding the previous page keeps back-navigation instant. Neighbours render
  // off to the side (still painted by pdf.js) while the reader is on the
  // current page; only the active page carries the text layer and tracking.
  const windowPages: number[] = [];
  if (numPages > 0) {
    for (let p = page - 1; p <= page + 1; p++) {
      if (p >= 1 && p <= numPages) windowPages.push(p);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* toolbar - hidden until the document is ready to avoid a dead bar over the loader */}
      <div
        className={`flex items-center gap-1 border-b border-white/10 px-3 py-1.5 text-white/70 ${
          numPages > 0 ? "" : "hidden"
        }`}
      >
        <button
          onClick={() => setShowThumbs((s) => !s)}
          className={`rounded p-1.5 transition-colors hover:bg-white/10 ${showThumbs ? "text-white" : ""}`}
          title="Pages"
          aria-label="Toggle page thumbnails"
        >
          <PanelLeft className="size-4" />
        </button>
        <button
          onClick={() => setShowSearch((s) => !s)}
          className={`rounded p-1.5 transition-colors hover:bg-white/10 ${showSearch ? "text-white" : ""}`}
          title="Search"
          aria-label="Search in document"
        >
          <Search className="size-4" />
        </button>

        {showSearch && (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
          >
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchMsg(null);
              }}
              placeholder="Find in document…"
              autoFocus
              className="h-7 w-44 rounded border border-white/15 bg-white/5 px-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
            <button
              type="submit"
              className="rounded px-2 py-1 text-xs hover:bg-white/10"
            >
              Find
            </button>
            {searchMsg && (
              <span className="text-xs text-white/50">{searchMsg}</span>
            )}
            <button
              type="button"
              onClick={() => setShowSearch(false)}
              className="rounded p-1 hover:bg-white/10"
              aria-label="Close search"
            >
              <X className="size-3.5" />
            </button>
          </form>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => zoomBy(-0.25)}
            disabled={zoom <= MIN_ZOOM}
            className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="min-w-11 rounded px-1 py-1 text-center font-mono text-xs hover:bg-white/10"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => zoomBy(0.25)}
            disabled={zoom >= MAX_ZOOM}
            className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>

      <Document
        file={fileUrl}
        onLoadSuccess={(pdf) => {
          pdfRef.current = pdf as unknown as PdfDoc;
          setNumPages(pdf.numPages);
          onPageChange(1, pdf.numPages);
        }}
        loading={<DocumentLoading />}
        error={
          <p className="py-24 text-center text-sm text-white/60">
            This document could not be displayed.
          </p>
        }
        className="flex min-h-0 flex-1"
      >
        <div className="flex min-h-0 flex-1">
          {/* thumbnail rail */}
          {showThumbs && numPages > 0 && (
            <div className="w-40 shrink-0 space-y-2 overflow-y-auto border-r border-white/10 bg-black/20 p-2">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => go(p)}
                  className={`block w-full overflow-hidden rounded border transition-colors ${
                    p === page
                      ? "border-white/80"
                      : "border-white/10 hover:border-white/40"
                  }`}
                >
                  <Page
                    pageNumber={p}
                    width={132}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading=""
                  />
                  <span className="block bg-black/40 py-0.5 text-center font-mono text-[10px] text-white/60">
                    {p}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* main page - the current page plus pre-rendered neighbours */}
          <div ref={frameRef} className="relative min-w-0 flex-1 overflow-auto">
            <div className="flex min-h-full min-w-max justify-center py-6">
              <div className="relative m-auto">
                {windowPages.map((p) => {
                  const active = p === page;
                  return (
                    <div
                      key={p}
                      // Only the visible page carries the tracking hook so the
                      // heatmap's querySelector matches the page in view.
                      data-track-page={active ? "" : undefined}
                      aria-hidden={active ? undefined : true}
                      className={active ? "shadow-2xl" : ""}
                      style={
                        active
                          ? undefined
                          : {
                              position: "absolute",
                              top: 0,
                              left: 0,
                              opacity: 0,
                              pointerEvents: "none",
                            }
                      }
                    >
                      <Page
                        pageNumber={p}
                        width={renderWidth}
                        renderTextLayer={active && !protection}
                        renderAnnotationLayer={false}
                        loading={
                          active ? (
                            <div
                              style={{ width: renderWidth, height: placeholderHeight }}
                              className="flex items-center justify-center bg-white"
                            >
                              <Loader2 className="size-6 animate-spin text-black/25" />
                            </div>
                          ) : (
                            ""
                          )
                        }
                        onLoadSuccess={
                          active
                            ? (pg) => {
                                const w = pg.originalWidth || pg.width;
                                const h = pg.originalHeight || pg.height;
                                if (w && h) setAspect(h / w);
                              }
                            : undefined
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {numPages > 1 && (
              <>
                <button
                  aria-label="Previous page"
                  onClick={() => go(page - 1)}
                  disabled={page <= 1}
                  className="sticky left-3 top-1/2 z-30 float-left -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur transition-opacity hover:bg-black/60 disabled:opacity-0"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  aria-label="Next page"
                  onClick={() => go(page + 1)}
                  disabled={page >= numPages}
                  className="sticky right-3 top-1/2 z-30 float-right -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur transition-opacity hover:bg-black/60 disabled:opacity-0"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </Document>

      {numPages > 1 && !showThumbs && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/60 px-4 py-1.5 font-mono text-xs text-white/90 backdrop-blur">
            <span className="tabular">
              {page} / {numPages}
            </span>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white/90 transition-all"
                style={{ width: `${(page / numPages) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
