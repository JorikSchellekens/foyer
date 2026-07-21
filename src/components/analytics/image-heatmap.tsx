"use client";

import { useEffect, useRef, useState } from "react";
import { paintHeat } from "./mouse-heatmap";

/** Attention overlay on top of an image document. */
export function ImageHeatmap({
  src,
  samples,
}: {
  src: string;
  samples: [number, number][];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    const wrap = wrapRef.current;
    const canvas = overlayRef.current;
    if (!wrap || !canvas) return;
    const paint = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      paintHeat(ctx, w, h, samples);
    };
    paint();
    const obs = new ResizeObserver(paint);
    obs.observe(wrap);
    return () => obs.disconnect();
  }, [loaded, samples]);

  return (
    <div
      ref={wrapRef}
      className="relative inline-block max-w-xl overflow-hidden rounded-md border shadow-sm"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="block h-auto w-full"
        onLoad={() => setLoaded(true)}
      />
      <canvas
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
}
