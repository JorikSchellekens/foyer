"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type TrailSeg = { p: number; t: number; d: number }; // page, enterMs, durMs

const PREVIEW_W = 152; // hover-card page render, high-res at its real size

// Fit a page of aspect A (= w/h) into a maxW x maxH box, preserving shape.
function fit(a: number, maxW: number, maxH: number) {
  if (a >= maxW / maxH) return { w: maxW, h: Math.round(maxW / a) };
  return { w: Math.round(maxH * a), h: maxH };
}

// Place the hover card near the cursor (offset up-right, flipped at edges).
function placeCard(
  el: HTMLElement,
  m: { x: number; y: number },
  gw: number,
  gh: number
) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = m.x + 18;
  if (left + w > gw) left = m.x - w - 18;
  left = Math.max(0, Math.min(left, Math.max(0, gw - w)));
  let top = m.y - h - 12;
  if (top < 0) top = m.y + 20;
  top = Math.max(0, Math.min(top, Math.max(0, gh - h)));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/**
 * The reading trajectory: page (rows) against cumulative reading time (x).
 * Dwell segments are packed contiguously, so the line has no idle gaps and
 * always fills the width; a step to a lower page is a backtrack / re-read.
 * The rail thumbnails size to the real page aspect; hovering a page draws a
 * high-res preview of it. The line draws itself in on load.
 */
export function ReadingTrajectory({
  trail,
  numPages,
  versionId,
  isPdf,
}: {
  trail: TrailSeg[];
  numPages: number;
  versionId?: string | null;
  isPdf: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const [plotW, setPlotW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [hoverSeg, setHoverSeg] = useState<number | null>(null);
  const [aspect, setAspect] = useState<number | null>(null); // page w/h
  const [ready, setReady] = useState(false); // gate the draw-in until measured
  const [failed, setFailed] = useState<Set<number>>(new Set());

  // precomputed page thumbnails, served as plain images
  const hasThumbs = isPdf && !!versionId;
  const thumbUrl = (p: number) => `/api/view/thumb/${versionId}/${p}`;

  const reduce = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const segs = useMemo(
    () => [...trail].filter((s) => s.d >= 0).sort((a, b) => a.t - b.t),
    [trail]
  );
  const maxSeen = useMemo(
    () => segs.reduce((m, s) => Math.max(m, s.p), 1),
    [segs]
  );

  const A = aspect ?? 8.5 / 11; // US Letter portrait until the first page loads
  // Long documents get a shorter rail: 200 rows at full thumbnail height is a
  // scroll marathon, and the shape of the path is what matters at that length.
  const dense = maxSeen > 32;
  const thumb = dense ? fit(A, 26, 22) : fit(A, 48, 44);
  const ROW = thumb.h + (dense ? 6 : 12);
  const RAIL = thumb.w + 26; // page number + gaps
  const preview = fit(A, PREVIEW_W, 210);
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
  const firstThumbPage = useMemo(() => {
    const ks = [...agg.keys()].sort((a, b) => a - b);
    return ks.length ? ks[0] : null;
  }, [agg]);

  // measure before paint so the draw-in runs at the right width
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (el) setPlotW(Math.max(120, el.clientWidth - RAIL));
  }, [RAIL]);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() =>
      setPlotW(Math.max(120, el.clientWidth - RAIL))
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [RAIL]);
  // Reveal once we know the page aspect (PDF) or on the next frame. Never
  // block the line forever if a PDF stalls: fall back after a short wait.
  useEffect(() => {
    if (hasThumbs && aspect == null) {
      const id = setTimeout(() => setReady(true), 1500);
      return () => clearTimeout(id);
    }
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [hasThumbs, aspect]);
  // Measure the page aspect from a thumbnail. A fresh Image with onload set
  // before src fires reliably even when the browser serves the image from
  // cache, where an <img>'s onLoad may not fire on a soft refresh.
  useEffect(() => {
    if (!hasThumbs || aspect != null || firstThumbPage == null) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight)
        setAspect(img.naturalWidth / img.naturalHeight);
    };
    img.src = `/api/view/thumb/${versionId}/${firstThumbPage}`;
    return () => {
      img.onload = null;
    };
  }, [hasThumbs, aspect, versionId, firstThumbPage]);

  const x = (ms: number) => (ms / T) * plotW;
  const yRow = (p: number) => (p - 1) * ROW + ROW / 2;
  const totalH = pages.length * ROW;

  // place the card at the cursor when it appears / when layout changes
  useLayoutEffect(() => {
    if (hover != null && peekRef.current)
      placeCard(peekRef.current, mouseRef.current, RAIL + plotW, totalH);
  }, [hover, RAIL, plotW, totalH]);

  const fmt = (ms: number) => {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };
  const fmtClock = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  // The draw reads as a story only if it finishes: cap the whole cascade at
  // about a second however many segments there are.
  const step = Math.min(0.035, 1 / Math.max(segs.length, 1));
  const delay = (i: number) => (0.1 + i * step).toFixed(3);

  const seenBefore = new Set<number>();
  const drawn = placed.map((s, i) => {
    const repeat = seenBefore.has(s.p);
    seenBefore.add(s.p);
    const prev = placed[i - 1];
    const back = prev && s.p < prev.p;
    const width = 3 + Math.sqrt(s.d / 1000) * 1.6;
    const len = Math.max(1, Math.abs(x(s.x1) - x(s.x0)));
    return { s, i, repeat, prev, back, width, len };
  });
  const last = placed[placed.length - 1];
  const animate = ready && !reduce;

  // the hover card follows the cursor; positioned in a handler / layout effect
  // (never during render) so the SVG doesn't re-render on every mouse move
  const track = (e: React.MouseEvent) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (peekRef.current)
      placeCard(peekRef.current, mouseRef.current, RAIL + plotW, totalH);
  };

  const grid = (
    <div
      ref={gridRef}
      className="relative"
      style={{ height: totalH }}
      onMouseMove={track}
      onMouseLeave={() => {
        setHover(null);
        setHoverSeg(null);
      }}
    >
      {pages.map((p) => {
        const v = visited.get(p);
        const active = hover === p;
        return (
          <div
            key={p}
            className="absolute inset-x-0 flex items-center"
            style={{ top: (p - 1) * ROW, height: ROW }}
            onMouseEnter={(e) => {
              track(e);
              setHover(p);
              setHoverSeg(null);
            }}
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
              <div
                className="overflow-hidden rounded-sm border transition-shadow"
                style={{
                  width: thumb.w,
                  height: thumb.h,
                  opacity: v ? 1 : 0.4,
                  background: "var(--card)",
                  borderColor: active ? "var(--primary)" : undefined,
                  boxShadow: active
                    ? "0 0 0 1px var(--primary)"
                    : undefined,
                }}
              >
                {v && hasThumbs && !failed.has(p) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl(p)}
                    alt=""
                    width={thumb.w}
                    height={thumb.h}
                    style={{
                      width: thumb.w,
                      height: thumb.h,
                      objectFit: "cover",
                      display: "block",
                    }}
                    onError={() =>
                      setFailed((prev) => new Set(prev).add(p))
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
        {ready &&
          drawn.map(({ s, i, prev, back }) =>
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
                  animation: animate
                    ? `traj-fade var(--dur) var(--ease-out-soft) ${delay(i)}s both`
                    : undefined,
                }}
              />
            ) : null
          )}
        {ready &&
          drawn.map(({ s, i, width, repeat, len }) => {
            const active = hover === s.p;
            // Highlight by dimming the rest, never by glowing the hovered one:
            // a halo would be the only decorative light in the app. Pages that
            // were never opened have nothing to highlight, so they dim nothing.
            const dim = hover != null && visited.has(hover) && !active;
            return (
              <g
                key={`s${i}`}
                style={{
                  opacity: dim ? 0.32 : 1,
                  transition: "opacity var(--dur-fast) var(--ease-out-soft)",
                }}
              >
                <line
                  x1={x(s.x0)}
                  y1={yRow(s.p)}
                  x2={x(s.x1)}
                  y2={yRow(s.p)}
                  strokeLinecap="round"
                  style={{
                    stroke: "var(--primary)",
                    strokeWidth: active ? width + 1.5 : width,
                    strokeDasharray: animate ? len : undefined,
                    strokeDashoffset: animate ? len : undefined,
                    animation: animate
                      ? `traj-draw var(--dur-reveal) var(--ease-out-quint) ${delay(i)}s forwards`
                      : undefined,
                  }}
                />
                <circle
                  cx={x(s.x0)}
                  cy={yRow(s.p)}
                  r={hoverSeg === i ? 5 : 3}
                  style={{
                    fill: "var(--card)",
                    stroke: repeat ? "var(--chart-4)" : "var(--primary)",
                    strokeWidth: 1.6,
                    animation: animate
                      ? `traj-fade var(--dur-fast) var(--ease-out-soft) ${delay(i)}s both`
                      : undefined,
                  }}
                />
              </g>
            );
          })}
        {ready && last && (
          <circle
            cx={x(last.x1)}
            cy={yRow(last.p)}
            r={6}
            style={{
              fill: "none",
              stroke: "var(--chart-4)",
              strokeWidth: 1.6,
              animation: animate
                ? `traj-fade var(--dur) var(--ease-out-soft) ${delay(drawn.length)}s both`
                : undefined,
            }}
          />
        )}
        {/* Hit layer. Each dwell run gets a band, and each dot a generous
            circle, so a 6px mark is still reachable with a mouse. */}
        {drawn.map(({ s, i, len }) => (
          <g key={`h${i}`}>
            <line
              x1={x(s.x0)}
              y1={yRow(s.p)}
              x2={x(s.x0) + Math.max(len, 6)}
              y2={yRow(s.p)}
              stroke="transparent"
              strokeWidth={Math.max(ROW, 20)}
              className="pointer-events-auto cursor-pointer"
              onMouseEnter={(e) => {
                track(e);
                setHover(s.p);
                setHoverSeg(i);
              }}
            />
            <circle
              cx={x(s.x0)}
              cy={yRow(s.p)}
              r={12}
              fill="transparent"
              className="pointer-events-auto cursor-pointer"
              onMouseEnter={(e) => {
                track(e);
                setHover(s.p);
                setHoverSeg(i);
              }}
            />
          </g>
        ))}
      </svg>

      {/* high-res hover preview, follows the cursor */}
      {hover != null && visited.get(hover) && (
        <div
          ref={peekRef}
          className="pointer-events-none absolute left-0 top-0 z-40 rounded-lg border bg-popover p-2 shadow-[var(--shadow-float)]"
          style={{
            animation: reduce
              ? undefined
              : "traj-pop var(--dur-fast) var(--ease-out-quint) both",
          }}
        >
          <div
            className="overflow-hidden rounded border bg-card"
            style={{ width: preview.w, height: preview.h }}
          >
            {hasThumbs && !failed.has(hover) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl(hover)}
                alt=""
                width={preview.w}
                height={preview.h}
                style={{
                  width: preview.w,
                  height: preview.h,
                  objectFit: "cover",
                  display: "block",
                }}
                onError={() => setFailed((prev) => new Set(prev).add(hover))}
              />
            ) : (
              <div
                className="flex h-full items-center justify-center font-mono text-lg text-muted-foreground"
                style={{ width: preview.w }}
              >
                {hover}
              </div>
            )}
          </div>
          <div className="mt-2 px-0.5" style={{ width: preview.w }}>
            <div className="flex items-baseline justify-between gap-3">
              {/* Value first: the reader already knows which page they hovered. */}
              <span className="font-mono text-sm tabular text-foreground">
                {fmt(visited.get(hover)!.dwell)}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Page {hover}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {visited.get(hover)!.visits > 1
                ? `${visited.get(hover)!.visits} separate stops`
                : "read once"}
              {hoverSeg != null && placed[hoverSeg] && (
                <> · this stop at {fmtClock(placed[hoverSeg].x0)}</>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Short reads do not need five ticks: they would all round to the same value.
  const ticks = T < 60_000 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const axis = (
    <div className="relative mt-1 h-4" style={{ marginLeft: RAIL }}>
      {ticks.map((f) => (
        <span
          key={f}
          className="absolute font-mono text-[10px] tabular text-muted-foreground"
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

  return (
    <>
      {/* Axis captions read as a sentence: page, down the rail; time, across. */}
      <div className="mb-1.5 flex items-baseline justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Page</span>
        <span>Cumulative reading time &rarr;</span>
      </div>
      {grid}
      {axis}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line
              x1="0"
              y1="3"
              x2="18"
              y2="3"
              stroke="var(--primary)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
          time on a page (thicker is longer)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line
              x1="0"
              y1="3"
              x2="18"
              y2="3"
              stroke="var(--chart-4)"
              strokeWidth="1.6"
              strokeDasharray="3 3"
            />
          </svg>
          back to an earlier page
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden>
            <circle
              cx="7"
              cy="7"
              r="5"
              fill="none"
              stroke="var(--chart-4)"
              strokeWidth="1.6"
            />
          </svg>
          where they stopped
        </span>
      </div>
      {numPages > maxSeen && (
        <p className="mt-2 text-xs text-muted-foreground">
          {numPages - maxSeen === 1
            ? `Page ${numPages} was never opened.`
            : `Pages ${maxSeen + 1} to ${numPages} were never opened.`}
        </p>
      )}
    </>
  );
}
