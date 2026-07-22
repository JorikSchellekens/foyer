"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/lib/format";

/**
 * Per-page reading time as a thumbnail dwell-strip: the real page thumbnail,
 * a bar sized to relative attention, and the average time. Thumbnails size to
 * the document's true page aspect (measured from the first that loads) and the
 * bars sweep in on mount.
 */
export function PageDwell({
  pages,
  versionId,
  isPdf = false,
}: {
  pages: { pageNumber: number; avgSeconds: number; views: number }[];
  versionId?: string | null;
  isPdf?: boolean;
}) {
  const [aspect, setAspect] = useState<number | null>(null); // page w/h
  const [shown, setShown] = useState(false);
  const reduce = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hasThumbs = isPdf && !!versionId;
  const firstThumbPage = pages[0]?.pageNumber ?? null;
  // Measure page aspect from a thumbnail via a fresh Image (onload set before
  // src) so it fires even when the image is served from cache on a soft
  // refresh, where an <img>'s onLoad may not.
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

  if (pages.length === 0)
    return (
      <p className="px-1 py-6 text-sm text-muted-foreground">
        Page-level timing appears after the first visit.
      </p>
    );

  const max = Math.max(...pages.map((p) => p.avgSeconds), 1);
  const topPage = pages.reduce((a, b) => (b.avgSeconds > a.avgSeconds ? b : a));
  const A = aspect ?? 8.5 / 11; // US Letter portrait until the first loads
  const H = 54;
  const W = Math.round(H * A);

  return (
    <div className="space-y-0.5">
      {pages.map((p, i) => {
        const pct = Math.max(
          (p.avgSeconds / max) * 100,
          p.avgSeconds > 0 ? 4 : 1.5
        );
        const hot = p.pageNumber === topPage.pageNumber && p.avgSeconds > 0;
        return (
          <div
            key={p.pageNumber}
            className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40"
          >
            <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground transition-colors group-hover:text-foreground">
              {p.pageNumber}
            </span>
            <div
              className="shrink-0 overflow-hidden rounded-md border bg-card shadow-sm transition group-hover:border-primary/60 group-hover:shadow-md"
              style={{ width: W, height: H }}
            >
              {hasThumbs ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/view/thumb/${versionId}/${p.pageNumber}`}
                  alt=""
                  loading="lazy"
                  style={{
                    width: W,
                    height: H,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  className="flex h-full items-center justify-center font-mono text-[10px] text-muted-foreground"
                  style={{ width: W }}
                >
                  {p.pageNumber}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span
                  className={`font-mono text-sm tabular-nums ${
                    hot ? "text-primary" : "text-foreground"
                  }`}
                >
                  {formatDuration(p.avgSeconds)}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    avg
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.views} {p.views === 1 ? "reader" : "readers"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
                  style={{
                    width: `${reduce || shown ? pct : 0}%`,
                    transition: reduce
                      ? undefined
                      : `width .6s cubic-bezier(.22,.61,.36,1) ${(0.05 + i * 0.025).toFixed(3)}s`,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
