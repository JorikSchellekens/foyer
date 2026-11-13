"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
/** Pages kept rendered on each side of the one being read. */
const RENDER_AHEAD = 2;
/** Arrow up / down scroll by this share of the frame's height. */
const LINE_STEP = 0.15;
/** The thumbnail rail starts open when the viewer is at least this wide. */
const THUMBS_MIN_W = 900;

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

/* The page-turn pair in the toolbar: larger than the other tools, and lit. */
const pageBtn =
  "inline-flex size-9 items-center justify-center rounded-md bg-white/10 text-white outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-25 max-sm:size-10";

/*
 * The arrows floating at the sides of the page. A white disc on the dark
 * frame so they read as buttons at a glance, 56px on a desktop and 44px on a
 * phone, where they sit over the page and scrolling does most of the work.
 */
const sideBtn =
  "absolute top-1/2 z-30 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#101418] shadow-[0_2px_6px_rgb(0_0_0/0.4),0_12px_28px_-8px_rgb(0_0_0/0.6)] outline-none transition-[background-color,opacity,scale] duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:scale-105 hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#101418] active:scale-95 disabled:pointer-events-none disabled:opacity-0 sm:size-14";

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
  // null = untouched: the rail is open when the viewer has the room for it
  // and closed when it does not. Once the reader toggles it, their choice holds.
  const [thumbsChoice, setThumbsChoice] = useState<boolean | null>(null);
  const [rootW, setRootW] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PdfDoc | null>(null);
  const pageTextRef = useRef<Map<number, string>>(new Map());
  // One box per page in the scrolling column, indexed by page number.
  const slotsRef = useRef<Array<HTMLDivElement | null>>([]);
  const thumbsRef = useRef<HTMLDivElement>(null);
  // The latest current page, for handlers that fire faster than a render.
  const pageRef = useRef(1);
  // Where the reader is, as a point inside a page (0 = its top edge, 1 = its
  // bottom edge) held at the middle of the frame. When the layout changes -
  // zoom, a resize, a page reporting its real shape - the same point is put
  // back in the middle, so the reader keeps their place.
  const anchorRef = useRef<{ page: number; frac: number } | null>(null);
  // A page reached with a button or key stays the current page until the
  // reader scrolls away, even where the scroll position alone would name a
  // neighbour: short pages near either end cannot be brought to the middle.
  const pinRef = useRef<{ page: number; top: number } | null>(null);

  // The viewer's own width, not the window's: beside an open contents pane
  // there is less room than the screen suggests.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setRootW(el.clientWidth);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const showThumbs = thumbsChoice ?? rootW >= THUMBS_MIN_W;

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

  // Read the scroll position: which page is being read, and where in it.
  const sync = useCallback(() => {
    const el = frameRef.current;
    if (!el || !numPages) return;
    const slots = slotsRef.current;
    const top = el.scrollTop;
    const center = top + el.clientHeight / 2;
    let current: number;
    const pin = pinRef.current;
    if (pin && Math.abs(pin.top - top) < 2) {
      current = pin.page;
    } else {
      pinRef.current = null;
      if (top <= 1) {
        current = 1;
      } else if (top + el.clientHeight >= el.scrollHeight - 1) {
        // The end of the document counts as its last page, however short.
        current = numPages;
      } else {
        // The page under the middle of the frame: the last one that starts
        // above it. Offsets only grow, so halve the range each step.
        let lo = 1;
        let hi = numPages;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          const slot = slots[mid];
          if (slot && slot.offsetTop <= center) lo = mid;
          else hi = mid - 1;
        }
        current = lo;
      }
    }
    const slot = slots[current];
    if (slot && slot.offsetHeight > 0) {
      anchorRef.current = {
        page: current,
        frac: (center - slot.offsetTop) / slot.offsetHeight,
      };
    }
    pageRef.current = current;
    setPage(current);
  }, [numPages]);

  // Bring a page into view: centred when it fits the frame, otherwise its top
  // edge just under the toolbar.
  const go = useCallback(
    (next: number) => {
      const el = frameRef.current;
      if (!el || !numPages) return;
      const clamped = Math.min(Math.max(next, 1), numPages);
      const slot = slotsRef.current[clamped];
      if (!slot) return;
      el.scrollTop =
        slot.offsetTop - Math.max(12, (el.clientHeight - slot.offsetHeight) / 2);
      pinRef.current = { page: clamped, top: el.scrollTop };
      sync();
    },
    [numPages, sync]
  );

  // Tell the tracker whenever the page being read changes, however the reader
  // got there: scrolling, a button, a key, a thumbnail or search.
  useEffect(() => {
    if (numPages > 0) onPageChange(page, numPages);
  }, [page, numPages, onPageChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Do not hijack keys while typing, or space while a control is focused.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const interactive =
        t && (t.tagName === "BUTTON" || t.tagName === "A" || t.tagName === "SELECT");
      const el = frameRef.current;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(pageRef.current + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(pageRef.current - 1);
      } else if (e.key === " " && !interactive) {
        // Space pages forward, shift-space back.
        e.preventDefault();
        go(pageRef.current + (e.shiftKey ? -1 : 1));
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // Up and down move a little at a time, as they do in any scrolling page.
        if (!el) return;
        e.preventDefault();
        const step = Math.max(40, el.clientHeight * LINE_STEP);
        el.scrollBy({ top: e.key === "ArrowDown" ? step : -step });
      } else if (e.key === "Home") {
        e.preventDefault();
        go(1);
      } else if (e.key === "End") {
        e.preventDefault();
        go(numPages);
      } else if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, numPages, showSearch]);

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

  // Each page is sized from its own real shape, falling back to the first
  // shape we measured, so the column holds its geometry before pdf.js paints.
  //
  // Fit the whole page: as large as the frame allows in both directions, so at
  // 100% a full page is in view at a time and a scroll moves to the next one.
  // Capped so an ultrawide monitor does not produce a blurry, oversized canvas.
  // Zoom scales from here. The padding covers the frame's p-4/sm:p-6 on both
  // sides plus a margin, which leaves the edge of the next page showing.
  const firstAspect = Object.values(aspects)[0];
  const PAD = frame.w < 640 ? 40 : 56;
  const MAX_W = 1600;
  const sizeOf = (p: number) => {
    const aspect = aspects[p] ?? firstAspect ?? FALLBACK_ASPECT;
    const fitWidth = Math.min(frame.w - PAD, (frame.h - PAD) / aspect, MAX_W);
    const width = Math.round(Math.max(240, fitWidth) * zoom);
    return { width, height: Math.round(width * aspect) };
  };

  // Put the reader's place back after anything that moves the pages. Runs
  // before the browser paints, so the page does not visibly jump.
  useLayoutEffect(() => {
    const el = frameRef.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    const slot = slotsRef.current[anchor.page];
    if (!slot) return;
    el.scrollTop =
      slot.offsetTop + anchor.frac * slot.offsetHeight - el.clientHeight / 2;
    if (pinRef.current) pinRef.current.top = el.scrollTop;
  }, [zoom, frame.w, frame.h, aspects, numPages]);

  // Keep the thumbnail of the page being read in view as the reader scrolls.
  useEffect(() => {
    if (!showThumbs) return;
    thumbsRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [page, showThumbs]);

  const markPainted = useCallback(
    (p: number) => setPainted((prev) => (prev[p] ? prev : { ...prev, [p]: true })),
    []
  );

  return (
    <div ref={rootRef} className="flex h-full flex-col">
      {/* toolbar - hidden until the document is ready to avoid a dead bar over the loader */}
      <div
        className={`relative items-center gap-0.5 px-2 py-1.5 text-white/70 sm:px-3 ${
          numPages > 0 ? "flex" : "hidden"
        }`}
      >
        <button
          onClick={() => setThumbsChoice(!showThumbs)}
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
            className={`mx-auto flex items-center gap-1 ${
              showSearch ? "max-sm:hidden" : ""
            }`}
          >
            <button
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              className={pageBtn}
              title="Previous page"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-[4.5rem] text-center font-mono text-sm tabular text-white">
              {page}
              <span className="text-white/45"> / {numPages}</span>
            </span>
            <button
              onClick={() => go(page + 1)}
              disabled={page >= numPages}
              className={pageBtn}
              title="Next page"
              aria-label="Next page"
            >
              <ChevronRight className="size-5" />
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
            title="Fit page"
            aria-label="Reset zoom to fit the page"
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
            <div
              ref={thumbsRef}
              className="w-32 shrink-0 space-y-2 overflow-y-auto border-r border-white/10 bg-black/25 p-2 sm:w-40"
            >
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

          {/*
           * Every page, top to bottom, in one scrolling column: the wheel, a
           * trackpad or a finger moves through the document. Each page has its
           * box from the start, so the scrollbar spans the whole document, but
           * only the pages around the one being read are rendered. The page
           * arrows overlay the frame from outside its scroll area, so they stay
           * centred on screen and add nothing to the scrollable size.
           */}
          <div className="relative min-w-0 flex-1">
            <div
              ref={frameRef}
              onScroll={sync}
              // The reader's place is restored by hand (see anchorRef); the
              // browser's own scroll anchoring would correct it a second time.
              className="absolute inset-0 overflow-auto overscroll-contain [overflow-anchor:none]"
            >
              <div className="relative flex min-h-full min-w-max flex-col items-center justify-center gap-4 p-4 sm:gap-6 sm:p-6">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
                  const active = p === page;
                  const near = Math.abs(p - page) <= RENDER_AHEAD;
                  const { width, height } = sizeOf(p);
                  return (
                    /*
                     * The sheet: a fixed-size box built from the page's own
                     * aspect ratio, white like paper until pdf.js has painted.
                     */
                    <div
                      key={p}
                      ref={(node) => {
                        slotsRef.current[p] = node;
                      }}
                      // Only the page being read carries the tracking hook, so
                      // the heatmap's querySelector matches that page.
                      data-track-page={active ? "" : undefined}
                      data-page={p}
                      className="relative shrink-0 overflow-hidden bg-white shadow-[0_1px_2px_rgb(0_0_0/0.45),0_18px_44px_-14px_rgb(0_0_0/0.6)]"
                      style={{ width, height }}
                    >
                      {near && !painted[p] && (
                        <div aria-hidden className="shimmer absolute inset-0 bg-white" />
                      )}
                      {near && (
                        <Page
                          pageNumber={p}
                          width={width}
                          renderTextLayer={!protection}
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
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {numPages > 1 && (
              <>
                <button
                  aria-label="Previous page"
                  title="Previous page"
                  onClick={() => go(page - 1)}
                  disabled={page <= 1}
                  className={`${sideBtn} left-2 sm:left-5`}
                >
                  <ChevronLeft className="size-6 sm:size-7" strokeWidth={2.25} />
                </button>
                <button
                  aria-label="Next page"
                  title="Next page"
                  onClick={() => go(page + 1)}
                  disabled={page >= numPages}
                  className={`${sideBtn} right-2 sm:right-5`}
                >
                  <ChevronRight className="size-6 sm:size-7" strokeWidth={2.25} />
                </button>
              </>
            )}
          </div>
        </div>
      </Document>
    </div>
  );
}
