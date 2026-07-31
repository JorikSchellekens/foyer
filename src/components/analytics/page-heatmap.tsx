"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { paintHeat } from "./mouse-heatmap";
import { Skeleton } from "@/components/ui/skeleton";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * Attention maps rendered over the actual PDF pages: one shared Document,
 * a heat overlay per viewed page.
 */
export function PageHeatmapGrid({
  fileUrl,
  pages,
}: {
  fileUrl: string;
  pages: { page: number; samples: [number, number][] }[];
}) {
  return (
    <Document
      file={fileUrl}
      // Hold the grid's shape while pdf.js works so the page never jumps.
      loading={<HeatSkeletonGrid count={Math.min(pages.length, 3)} />}
      error={
        <p className="rounded-md border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          The document could not be rendered, so its attention maps cannot be
          drawn over the real pages.
        </p>
      }
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {pages.map(({ page, samples }) => (
          <HeatPage key={page} page={page} samples={samples} />
        ))}
      </div>
    </Document>
  );
}

/** Page-shaped skeletons: same grid, same aspect, so nothing reflows. */
function HeatSkeletonGrid({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: Math.max(count, 1) }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[1/1.294] w-full border" />
          <Skeleton className="mx-auto mt-1.5 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function HeatPage({
  page,
  samples,
}: {
  page: number;
  samples: [number, number][];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(320);
  const [rendered, setRendered] = useState(false);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setWidth(el.clientWidth));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!rendered) return;
    const wrap = wrapRef.current;
    const canvas = overlayRef.current;
    if (!wrap || !canvas) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    paintHeat(ctx, w, h, samples);
    setPainted(true);
  }, [rendered, samples, width]);

  return (
    <figure className="reveal">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-md border shadow-[var(--shadow-hairline)]"
      >
        <Page
          pageNumber={page}
          width={width}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          onRenderSuccess={() => setRendered(true)}
        />
        {/* The heat crossfades in over the finished page render. */}
        <canvas
          ref={overlayRef}
          data-painted={painted}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-[var(--dur-reveal)] ease-[var(--ease-out-soft)] data-[painted=true]:opacity-100"
        />
      </div>
      <figcaption className="mt-1.5 text-center text-xs text-muted-foreground">
        Page <span className="font-mono tabular">{page}</span> ·{" "}
        <span className="font-mono tabular">{samples.length}</span> cursor
        samples
      </figcaption>
    </figure>
  );
}
