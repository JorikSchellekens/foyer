"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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
  const [width, setWidth] = useState<number>(800);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setWidth(Math.min(el.clientWidth - 2, 1100));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ")
        go(page + 1);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page]);

  return (
    <div className="flex h-full flex-col">
      <div ref={frameRef} className="relative flex-1 overflow-auto">
        <div className="flex min-h-full items-start justify-center py-6">
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              onPageChange(1, n);
            }}
            loading={
              <div className="flex items-center gap-2 py-24 text-sm text-white/60">
                <Loader2 className="size-4 animate-spin" /> Preparing document…
              </div>
            }
            error={
              <p className="py-24 text-sm text-white/60">
                This document could not be displayed.
              </p>
            }
          >
            <div className="shadow-2xl" data-track-page>
              <Page
                pageNumber={page}
                width={width}
                renderTextLayer={!protection}
                renderAnnotationLayer={false}
              />
            </div>
          </Document>
        </div>

        {/* edge tap zones */}
        {numPages > 1 && (
          <>
            <button
              aria-label="Previous page"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              className="fixed left-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur transition-opacity hover:bg-black/60 disabled:opacity-0"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              aria-label="Next page"
              onClick={() => go(page + 1)}
              disabled={page >= numPages}
              className="fixed right-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur transition-opacity hover:bg-black/60 disabled:opacity-0"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {numPages > 1 && (
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
