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
/** Fallback page shape (US Letter) until the real aspect ratio is known. */
const FALLBACK_ASPECT = 1.294;
/** Crossfade window for a page turn, matched to --dur. */
const TURN_MS = 220;

// Minimal structural view of the loaded PDF, enough to extract page text for
// search without depending on a specific pdfjs-dist type version.
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
  }>;
};

/*
 * max-sm:size-10: at the desktop padding these are 28px boxes, which a mouse
 * hits every time and a thumb does not. Below sm the hit area grows to 40px
 * while the icon stays the same size, so the toolbar reads identically - the
 * target is simply larger than the thing drawn inside it. Six of these plus
 * the counter still fit across a 320px phone.
 */
const toolBtn =
  "inline-flex items-center justify-center rounded-md p-1.5 max-sm:size-10 max-sm:p-0 text-white/55 outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-25";

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
  // Per-page aspect ratio (height / width). Sizing the frame from the real
  // shape is what keeps a page turn from shifting the layout.
  const [aspects, setAspects] = useState<Record<number, number>>({});
  // Pages pdf.js has actually painted. A page is only revealed once it is in
  // here, so a turn never shows an empty sheet.
  const [painted, setPainted] = useState<Record<number, true>>({});
  const [loadPct, setLoadPct] = useState<number | null>(null);
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
      // Do not hijack keys while typing, or space while a control is focused.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const interactive =
        t && (t.tagName === "BUTTON" || t.tagName === "A" || t.tagName === "SELECT");
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") {
        go(page + 1);
      } else if (e.key === " " && !interactive) {
        // Space pages forward; without this it would also scroll the frame.
        e.preventDefault();
        go(page + 1);
      } else if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowUp" ||
        e.key === "PageUp"
      ) {
        go(page - 1);
      } else if (e.key === "Home") {
        go(1);
      } else if (e.key === "End") {
        go(numPages);
      } else if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page, numPages, showSearch]);

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
  // Size the sheet from this page's real shape, falling back to the first page
  // we measured, so the frame holds its geometry before pdf.js paints.
  const firstAspect = Object.values(aspects)[0];
  const pageAspect = aspects[page] ?? firstAspect ?? FALLBACK_ASPECT;
  const sheetHeight = Math.round(renderWidth * pageAspect);
  const ready = !!painted[page];

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

  // The page being turned away from, kept mounted underneath the incoming one
  // so the turn is a crossfade rather than a blank frame. Held until the new
  // page has painted, then for one more transition to fade out.
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const shownRef = useRef(1);
  useEffect(() => {
    if (shownRef.current === page) return;
    setOutgoing(shownRef.current);
    if (!painted[page]) return;
    shownRef.current = page;
    const t = setTimeout(() => setOutgoing(null), TURN_MS);
    return () => clearTimeout(t);
  }, [page, painted]);

  const mounted = windowPages.slice();
  if (outgoing !== null && !mounted.includes(outgoing)) mounted.push(outgoing);

  const markPainted = useCallback(
    (p: number) => setPainted((prev) => (prev[p] ? prev : { ...prev, [p]: true })),
    []
  );

  return (
    <div className="flex h-full flex-col">
      {/* toolbar - hidden until the document is ready to avoid a dead bar over the loader */}
      <div
        className={`relative items-center gap-0.5 px-2 py-1.5 text-white/70 sm:px-3 ${
          numPages > 0 ? "flex" : "hidden"
        }`}
      >
        <button
          onClick={() => setShowThumbs((s) => !s)}
          className={`${toolBtn} ${showThumbs ? "bg-white/10 text-white" : ""}`}
          title="Pages"
          aria-label="Toggle page thumbnails"
          aria-pressed={showThumbs}
        >
          <PanelLeft className="size-4" />
        </button>
        <button
          onClick={() => setShowSearch((s) => !s)}
          className={`${toolBtn} ${showSearch ? "bg-white/10 text-white" : ""}`}
          title="Search"
          aria-label="Search in document"
          aria-pressed={showSearch}
        >
          <Search className="size-4" />
        </button>

        {showSearch && (
          <form
            className="flex items-center gap-1 duration-[var(--dur)] ease-[var(--ease-out-quint)] animate-in fade-in-0 slide-in-from-left-1"
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
              aria-label="Find in document"
              className="h-7 w-32 rounded-md border border-white/15 bg-white/5 px-2 text-xs text-white transition-colors duration-[var(--dur-fast)] placeholder:text-white/35 focus:border-white/30 focus:bg-white/10 focus:outline-none sm:w-44"
            />
            <button
              type="submit"
              className="rounded-md px-2 py-1 text-xs text-white/70 outline-none transition-colors duration-[var(--dur-fast)] hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
            >
              Find
            </button>
            <span
              aria-live="polite"
              className="hidden font-mono text-[11px] text-white/45 sm:inline"
            >
              {searchMsg}
            </span>
            <button
              type="button"
              onClick={() => setShowSearch(false)}
              className={toolBtn}
              aria-label="Close search"
            >
              <X className="size-3.5" />
            </button>
          </form>
        )}

        {/* page position: the one number a reader looks for, set in mono */}
        {numPages > 0 && (
          <div
            className={`mx-auto flex items-center gap-0.5 ${
              showSearch ? "max-sm:hidden" : ""
            }`}
          >
            <button
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              className={toolBtn}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-16 text-center font-mono text-xs tabular text-white/80">
              {page}
              <span className="text-white/35"> / {numPages}</span>
            </span>
            <button
              onClick={() => go(page + 1)}
              disabled={page >= numPages}
              className={toolBtn}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => zoomBy(-0.25)}
            disabled={zoom <= MIN_ZOOM}
            className={toolBtn}
            aria-label="Zoom out"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="hidden min-w-11 rounded-md px-1 py-1 text-center font-mono text-xs tabular text-white/55 outline-none transition-colors duration-[var(--dur-fast)] hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 sm:block"
            title="Reset zoom"
            aria-label="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => zoomBy(0.25)}
            disabled={zoom >= MAX_ZOOM}
            className={toolBtn}
            aria-label="Zoom in"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>

        {/* reading progress: a hairline ribbon along the toolbar's edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10"
        >
          <div
            className="h-full bg-white/50 transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out-quint)]"
            style={{ width: numPages ? `${(page / numPages) * 100}%` : "0%" }}
          />
        </div>
      </div>

      <Document
        file={fileUrl}
        onLoadSuccess={(pdf) => {
          pdfRef.current = pdf as unknown as PdfDoc;
          setNumPages(pdf.numPages);
          onPageChange(1, pdf.numPages);
        }}
        onLoadProgress={({ loaded, total }) =>
          setLoadPct(total ? Math.min(100, Math.round((loaded / total) * 100)) : null)
        }
        loading={<DocumentLoading progress={loadPct} />}
        error={
          <div className="flex size-full items-center justify-center p-8">
            <p className="text-center text-sm text-white/55">
              This document could not be displayed.
            </p>
          </div>
        }
        className="flex min-h-0 flex-1"
      >
        <div className="flex min-h-0 flex-1">
          {/* thumbnail rail */}
          {showThumbs && numPages > 0 && (
            <div className="w-32 shrink-0 space-y-2 overflow-y-auto border-r border-white/10 bg-black/25 p-2 sm:w-40">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => go(p)}
                  aria-label={`Go to page ${p}`}
                  aria-current={p === page ? "page" : undefined}
                  className={`block w-full overflow-hidden rounded-md border bg-white/[0.04] outline-none transition-colors duration-[var(--dur-fast)] focus-visible:ring-2 focus-visible:ring-white/50 ${
                    p === page
                      ? "border-white/70"
                      : "border-white/10 hover:border-white/40"
                  }`}
                >
                  <Page
                    pageNumber={p}
                    width={116}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading=""
                  />
                  <span className="block bg-black/40 py-0.5 text-center font-mono text-[10px] tabular text-white/55">
                    {p}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* main page - the current page plus pre-rendered neighbours */}
          <div
            ref={frameRef}
            className="relative min-w-0 flex-1 overflow-auto overscroll-contain"
          >
            <div className="flex min-h-full min-w-max justify-center p-4 sm:p-6">
              {/*
               * The sheet: a fixed-size box built from the page's own aspect
               * ratio. Pages stack inside it absolutely, so turning a page
               * crossfades in place instead of remeasuring the layout.
               */}
              <div
                className="relative m-auto overflow-hidden bg-white shadow-[0_1px_2px_rgb(0_0_0/0.45),0_18px_44px_-14px_rgb(0_0_0/0.6)]"
                style={{ width: renderWidth, height: sheetHeight }}
              >
                {/* Blank paper while pdf.js rasterises: never a dark gap. */}
                {!ready && (
                  <div aria-hidden className="shimmer absolute inset-0 bg-white" />
                )}
                {mounted.map((p) => {
                  const active = p === page;
                  const isOut = !active && p === outgoing;
                  // Neighbours stay mounted but fully transparent: pdf.js has
                  // already rasterised them, so the turn is instant.
                  const opacity = active ? (ready ? 1 : 0) : isOut ? (ready ? 0 : 1) : 0;
                  return (
                    <div
                      key={p}
                      // Only the visible page carries the tracking hook so the
                      // heatmap's querySelector matches the page in view.
                      data-track-page={active ? "" : undefined}
                      aria-hidden={active ? undefined : true}
                      className="absolute left-0 top-0 transition-opacity duration-[var(--dur)] ease-[var(--ease-out-soft)]"
                      style={{
                        opacity,
                        zIndex: active ? 2 : 1,
                        pointerEvents: active ? undefined : "none",
                      }}
                    >
                      <Page
                        pageNumber={p}
                        width={renderWidth}
                        renderTextLayer={active && !protection}
                        renderAnnotationLayer={false}
                        loading=""
                        onRenderSuccess={() => markPainted(p)}
                        onLoadSuccess={(pg) => {
                          const w = pg.originalWidth || pg.width;
                          const h = pg.originalHeight || pg.height;
                          if (w && h)
                            setAspects((prev) =>
                              prev[p] ? prev : { ...prev, [p]: h / w }
                            );
                        }}
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
                  className="sticky left-2 top-1/2 z-30 float-left -translate-y-1/2 rounded-full border border-white/10 bg-black/35 p-2.5 text-white/70 outline-none backdrop-blur transition-[background-color,color,opacity] duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:bg-black/60 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-0 sm:left-3"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  aria-label="Next page"
                  onClick={() => go(page + 1)}
                  disabled={page >= numPages}
                  className="sticky right-2 top-1/2 z-30 float-right -translate-y-1/2 rounded-full border border-white/10 bg-black/35 p-2.5 text-white/70 outline-none backdrop-blur transition-[background-color,color,opacity] duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:bg-black/60 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-0 sm:right-3"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </Document>
    </div>
  );
}
