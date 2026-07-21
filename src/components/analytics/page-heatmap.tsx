"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import { paintHeat } from "./mouse-heatmap";
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
      loading={
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Rendering pages…
        </div>
      }
      error={
        <p className="py-12 text-sm text-muted-foreground">
          The document could not be rendered; showing schematic maps is not
          possible either without it.
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
  }, [rendered, samples, width]);

  return (
    <figure>
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-md border shadow-sm"
      >
        <Page
          pageNumber={page}
          width={width}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          onRenderSuccess={() => setRendered(true)}
        />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>
      <figcaption className="mt-1.5 text-center font-mono text-xs text-muted-foreground">
        Page {page} · {samples.length} samples
      </figcaption>
    </figure>
  );
}
