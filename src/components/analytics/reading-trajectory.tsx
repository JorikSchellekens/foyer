"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export type TrailSeg = { p: number; t: number; d: number }; // page, enterMs, durMs

// Fit a page of aspect A (= w/h) into a maxW x maxH box, preserving shape.
function fit(a: number, maxW: number, maxH: number) {
  if (a >= maxW / maxH) return { w: maxW, h: Math.round(maxW / a) };
  return { w: Math.round(maxH * a), h: maxH };
}

/**
 * The reading trajectory: page (rows) against cumulative reading time (x).
 * Dwell segments are packed contiguously, so the line has no idle gaps and
 * always fills the width; a step to a lower page is a backtrack / re-read.
 * Each page carries a thumbnail of the real page, sized to its true aspect.
 */
export function ReadingTrajectory({
  trail,
  numPages,
  fileUrl,
  isPdf,
}: {
  trail: TrailSeg[];
  numPages: number;
  fileUrl?: string | null;
  isPdf: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [plotW, setPlotW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [aspect, setAspect] = useState<number | null>(null); // page w/h

  // thumbnail + layout dimensions derived from the real page aspect
  const A = aspect ?? 8.5 / 11; // US Letter portrait until the first page loads
  const thumb = fit(A, 48, 44);
  const ROW = thumb.h + 12;
  const RAIL = thumb.w + 26; // page number + gaps

  const segs = useMemo(
    () => [...trail].filter((s) => s.d >= 0).sort((a, b) => a.t - b.t),
    [trail]
  );
  const maxSeen = useMemo(
    () => segs.reduce((m, s) => Math.max(m, s.p), 1),
    [segs]
  );
  const pages = useMemo(
    () => Array.from({ length: maxSeen }, (_, i) => i + 1),
    [maxSeen]
  );

  // pack segments end-to-end by dwell -> cumulative-reading-time x axis
  const placed = useMemo(() => {
    const out: (TrailSeg & { x0: number; x1: number })[] = [];
    segs.reduce((cum, s) => {
      out.push({ ...s, x0: cum, x1: cum + s.d });
      return cum + s.d;
    }, 0);
    return out;
  }, [segs]);
  const T = Math.max(1, placed.length ? placed[placed.length - 1].x1 : 1);

  const agg = useMemo(() => {
    const m = new Map<number, { dwell: number; visits: number }>();
    for (const s of segs) {
      const e = m.get(s.p) ?? { dwell: 0, visits: 0 };
      e.dwell += s.d;
      e.visits += 1;
      m.set(s.p, e);
    }
    return m;
  }, [segs]);
  const visited = agg;

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() =>
      setPlotW(Math.max(120, el.clientWidth - RAIL))
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [RAIL]);

  const x = (ms: number) => (ms / T) * plotW;
  const yRow = (p: number) => (p - 1) * ROW + ROW / 2;
  const totalH = pages.length * ROW;

  const fmt = (ms: number) => {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };
  const fmtClock = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const seenBefore = new Set<number>();
  const drawn = placed.map((s, i) => {
    const repeat = seenBefore.has(s.p);
    seenBefore.add(s.p);
    const prev = placed[i - 1];
    const back = prev && s.p < prev.p;
    const width = 3 + Math.sqrt(s.d / 1000) * 1.6;
    return { s, i, repeat, prev, back, width };
  });
  const last = placed[placed.length - 1];

  const grid = (
    <div
      ref={gridRef}
      className="relative"
      style={{ height: totalH }}
      onMouseLeave={() => setHover(null)}
    >
      {pages.map((p) => {
        const v = visited.get(p);
        const active = hover === p;
        return (
          <div
            key={p}
            className="absolute inset-x-0 flex items-center"
            style={{ top: (p - 1) * ROW, height: ROW }}
            onMouseEnter={() => setHover(p)}
          >
            <div
              className="flex shrink-0 items-center gap-1.5"
              style={{ width: RAIL }}
            >
              <span
                className="w-4 text-right font-mono text-[10px] tabular-nums"
                style={{
                  color: v ? "var(--muted-foreground)" : "var(--border)",
                }}
              >
                {p}
              </span>
              <div style={{ width: thumb.w, height: thumb.h }}>
                <div
                  className="overflow-hidden rounded-sm border transition-transform duration-150"
                  style={{
                    width: thumb.w,
                    height: thumb.h,
                    transform: active ? "scale(2.2)" : "scale(1)",
                    transformOrigin: "left center",
                    zIndex: active ? 20 : 1,
                    position: "relative",
                    boxShadow: active ? "0 6px 22px rgba(0,0,0,.3)" : "none",
                    opacity: v ? 1 : 0.45,
                    background: "var(--card)",
                  }}
                >
                  {v && isPdf ? (
                    <Page
                      pageNumber={p}
                      width={thumb.w}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      onLoadSuccess={(pg) => {
                        if (aspect == null && pg.originalWidth && pg.originalHeight)
                          setAspect(pg.originalWidth / pg.originalHeight);
                      }}
                      loading={
                        <div style={{ width: thumb.w, height: thumb.h }} />
                      }
                    />
                  ) : (
                    <div
                      className="flex h-full items-center justify-center font-mono text-[9px]"
                      style={{ width: thumb.w, color: "var(--muted-foreground)" }}
                    >
                      {p}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <svg
        className="pointer-events-none absolute top-0"
        style={{ left: RAIL, width: plotW, height: totalH }}
        width={plotW}
        height={totalH}
      >
        {pages.map((p) => (
          <line
            key={p}
            x1={0}
            y1={yRow(p)}
            x2={plotW}
            y2={yRow(p)}
            style={{ stroke: "var(--border)", strokeWidth: 1, opacity: 0.5 }}
          />
        ))}
        {drawn.map(({ s, i, prev, back }) =>
          prev ? (
            <line
              key={`c${i}`}
              x1={x(prev.x1)}
              y1={yRow(prev.p)}
              x2={x(s.x0)}
              y2={yRow(s.p)}
              style={{
                stroke: back ? "var(--chart-4)" : "var(--muted-foreground)",
                strokeWidth: back ? 1.6 : 1.3,
                opacity: back ? 0.9 : 0.5,
                strokeDasharray: back ? "3 3" : undefined,
              }}
            />
          ) : null
        )}
        {drawn.map(({ s, i, width, repeat }) => {
          const active = hover === s.p;
          return (
            <g key={`s${i}`}>
              <line
                x1={x(s.x0)}
                y1={yRow(s.p)}
                x2={x(s.x1)}
                y2={yRow(s.p)}
                strokeLinecap="round"
                style={{
                  stroke: "var(--primary)",
                  strokeWidth: width,
                  filter: active
                    ? "drop-shadow(0 0 5px color-mix(in oklab, var(--primary) 60%, transparent))"
                    : undefined,
                }}
              />
              <circle
                cx={x(s.x0)}
                cy={yRow(s.p)}
                r={active ? 5 : 3}
                style={{
                  fill: "var(--card)",
                  stroke: repeat ? "var(--chart-4)" : "var(--primary)",
                  strokeWidth: 1.6,
                }}
              />
            </g>
          );
        })}
        {last && (
          <circle
            cx={x(last.x1)}
            cy={yRow(last.p)}
            r={6}
            style={{ fill: "none", stroke: "var(--chart-4)", strokeWidth: 1.6 }}
          />
        )}
        {drawn.map(({ s, i }) => (
          <line
            key={`h${i}`}
            x1={x(s.x0)}
            y1={yRow(s.p)}
            x2={Math.max(x(s.x1), x(s.x0) + 6)}
            y2={yRow(s.p)}
            stroke="transparent"
            strokeWidth={ROW}
            className="pointer-events-auto cursor-pointer"
            onMouseEnter={() => setHover(s.p)}
          />
        ))}
      </svg>

      {hover != null && visited.get(hover) && (
        <div
          className="pointer-events-none absolute z-30 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: RAIL + thumb.w + 14, top: Math.max(0, yRow(hover) - 22) }}
        >
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            Page {hover}
          </span>
          <div className="mt-0.5 font-mono tabular-nums text-primary">
            {fmt(visited.get(hover)!.dwell)}
            {visited.get(hover)!.visits > 1 && (
              <span style={{ color: "var(--chart-4)" }}>
                {" "}
                · {visited.get(hover)!.visits} visits
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const axis = (
    <div className="relative mt-1 h-4" style={{ marginLeft: RAIL }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <span
          key={f}
          className="absolute font-mono text-[10px] tabular-nums text-muted-foreground"
          style={{
            left: `${f * 100}%`,
            transform:
              f === 0
                ? "none"
                : f === 1
                  ? "translateX(-100%)"
                  : "translateX(-50%)",
          }}
        >
          {fmtClock(T * f)}
        </span>
      ))}
    </div>
  );

  const body = (
    <>
      {grid}
      {axis}
      {numPages > maxSeen && (
        <p className="mt-3 text-xs text-muted-foreground">
          Pages {maxSeen + 1}&ndash;{numPages} were never opened.
        </p>
      )}
    </>
  );

  if (isPdf && fileUrl) {
    return (
      <Document
        file={fileUrl}
        loading={
          <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Rendering pages&hellip;
          </div>
        }
        error={<>{body}</>}
      >
        {body}
      </Document>
    );
  }
  return body;
}
