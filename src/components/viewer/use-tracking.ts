"use client";

import { useCallback, useEffect, useRef } from "react";

type MouseSample = [number, number, number]; // [tMs, xPct, yPct]

/**
 * Viewer-side telemetry: active seconds, per-page dwell, sampled mouse paths.
 * Beacons every 5s while visible, and once more on pagehide.
 */
export function useTracking({
  viewId,
  token,
  versionId,
  numPages,
  claimSession = false,
  preview = false,
}: {
  viewId: string;
  token: string;
  versionId?: string | null;
  numPages?: number | null;
  /** persist this view id into the gate cookie (top-level views only) */
  claimSession?: boolean;
  /** owner preview: meter nothing, send no beacons */
  preview?: boolean;
}) {
  const pageRef = useRef(1);
  const maxPageRef = useRef(1);
  const lastBeatRef = useRef(Date.now());
  const dwellRef = useRef<Map<number, number>>(new Map());
  const mouseRef = useRef<Map<number, MouseSample[]>>(new Map());
  const startRef = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const setPage = useCallback((page: number) => {
    // bank dwell on the page we are leaving
    const now = Date.now();
    if (document.visibilityState === "visible") {
      const prev = pageRef.current;
      const secs = (now - lastBeatRef.current) / 1000;
      dwellRef.current.set(prev, (dwellRef.current.get(prev) ?? 0) + secs);
      lastBeatRef.current = now;
    }
    pageRef.current = page;
    maxPageRef.current = Math.max(maxPageRef.current, page);
  }, []);

  const flush = useCallback(
    (useBeacon = false) => {
      if (preview) return;
      const now = Date.now();
      let delta = 0;
      if (document.visibilityState === "visible" || useBeacon) {
        delta = Math.min((now - lastBeatRef.current) / 1000, 120);
        const p = pageRef.current;
        dwellRef.current.set(p, (dwellRef.current.get(p) ?? 0) + delta);
      }
      lastBeatRef.current = now;

      const dwell = [...dwellRef.current.entries()]
        .filter(([, s]) => s > 0.2)
        .map(([page, seconds]) => ({
          page,
          seconds: Math.min(seconds, 120),
        }));
      const mouse = [...mouseRef.current.entries()]
        .filter(([, samples]) => samples.length > 0)
        .map(([page, samples]) => ({ page, samples: samples.slice(0, 600) }));

      if (delta < 0.2 && dwell.length === 0 && mouse.length === 0) return;

      dwellRef.current = new Map();
      mouseRef.current = new Map();

      const body = JSON.stringify({
        token,
        viewId,
        delta: Math.round(dwell.reduce((s, d) => s + d.seconds, 0) * 10) / 10,
        page: pageRef.current,
        versionId: versionId ?? undefined,
        completedPct: numPages
          ? Math.min(100, Math.round((maxPageRef.current / numPages) * 100))
          : undefined,
        dwell,
        mouse,
      });

      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/view/track", body);
      } else {
        fetch("/api/view/track", {
          method: "POST",
          body,
          keepalive: true,
        }).catch(() => {});
      }
    },
    [token, viewId, versionId, numPages, preview]
  );

  // Mouse sampling, throttled. Coordinates are relative to the rendered
  // page element ([data-track-page]) when one exists, so heatmaps can be
  // drawn over the actual page content; otherwise the scroll container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastSample = 0;
    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastSample < 80) return;
      lastSample = now;
      const target =
        (el.querySelector("[data-track-page]") as HTMLElement | null) ?? el;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
      const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
      // pointer outside the page (margins, chrome) carries no signal
      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      const page = pageRef.current;
      const arr = mouseRef.current.get(page) ?? [];
      arr.push([Math.round(Date.now() - startRef.current), x, y]);
      mouseRef.current.set(page, arr);
    };
    el.addEventListener("mousemove", onMove, { passive: true });
    return () => el.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (preview || !claimSession) return;
    fetch("/api/view/claim", {
      method: "POST",
      body: JSON.stringify({ token, viewId }),
    }).catch(() => {});
  }, [claimSession, token, viewId, preview]);

  useEffect(() => {
    lastBeatRef.current = Date.now();
    const interval = setInterval(() => flush(false), 5000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush(true);
      else lastBeatRef.current = Date.now();
    };
    const onHide = () => flush(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      flush(true);
    };
  }, [flush]);

  const notifyDownload = useCallback(() => {
    if (preview) return;
    fetch("/api/view/track", {
      method: "POST",
      body: JSON.stringify({ token, viewId, downloaded: true }),
      keepalive: true,
    }).catch(() => {});
  }, [token, viewId, preview]);

  return { setPage, containerRef, notifyDownload };
}
