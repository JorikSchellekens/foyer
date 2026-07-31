"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The attention ramp: one hue, pale green to library green. Single-hue
 * sequential so intensity reads as order (and survives colour-vision
 * deficiency and greyscale print); a rainbow would invent categories that the
 * data does not have. Stops are the chart tokens' light-mode values, because
 * the heat is always painted over a light page render, never over the app
 * surface.
 */
const HEAT_STOPS: [number, number, number][] = [
  [163, 196, 181], // --chart-3
  [78, 139, 116], // --chart-2
  [23, 91, 71], // --chart-1
];
const HEAT_MAX_ALPHA = 0.62; // the page underneath must stay readable

function heatColor(t: number) {
  const p = t * (HEAT_STOPS.length - 1);
  const i = Math.min(Math.floor(p), HEAT_STOPS.length - 2);
  const k = p - i;
  const a = HEAT_STOPS[i];
  const b = HEAT_STOPS[i + 1];
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ] as const;
}

/**
 * Paint attention density onto a canvas sized w×h (CSS pixels). Exported so
 * the page-content heatmap can overlay the same rendering on a real page.
 */
export function paintHeat(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  samples: [number, number][]
) {
  if (samples.length === 0) return;
  const heat = document.createElement("canvas");
  heat.width = w;
  heat.height = h;
  const hctx = heat.getContext("2d")!;
  const radius = Math.max(w * 0.045, 14);
  for (const [x, y] of samples) {
    const cx = (x / 100) * w;
    const cy = (y / 100) * h;
    const g = hctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, "rgba(0,0,0,0.12)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    hctx.fillStyle = g;
    hctx.beginPath();
    hctx.arc(cx, cy, radius, 0, Math.PI * 2);
    hctx.fill();
  }

  // colorize accumulated alpha through the single-hue green ramp
  const img = hctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] / 255;
    if (a <= 0.02) continue;
    const t = Math.min(a * 1.8, 1);
    const [r, g, b] = heatColor(t);
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    // Alpha climbs with intensity too, so the faintest attention is a wash.
    out.data[i + 3] = Math.round(Math.pow(t, 0.85) * HEAT_MAX_ALPHA * 255);
  }
  const overlay = document.createElement("canvas");
  overlay.width = w;
  overlay.height = h;
  overlay.getContext("2d")!.putImageData(out, 0, 0);
  ctx.drawImage(overlay, 0, 0);
}

/**
 * The ramp, spelled out. Attention maps encode one thing - how long the cursor
 * lingered - and the reader has no way to know that from the wash alone.
 */
export function HeatLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}
    >
      <span>Cursor dwell</span>
      <span className="text-[11px]">brief</span>
      <span
        aria-hidden
        className="h-2 w-24 rounded-full border"
        style={{
          background: `linear-gradient(90deg, ${HEAT_STOPS.map(
            ([r, g, b], i) =>
              `rgb(${r} ${g} ${b} / ${(0.25 + 0.6 * (i / (HEAT_STOPS.length - 1))).toFixed(2)})`
          ).join(", ")})`,
        }}
      />
      <span className="text-[11px]">sustained</span>
    </div>
  );
}

/**
 * Abstract attention map: density over a schematic page. Used when the
 * viewed document has no renderable page image (Notion, video, …).
 */
export function MouseHeatmap({
  samples,
  aspect = 1.414, // A4 portrait by default
}: {
  samples: [number, number][]; // [xPct, yPct]
  aspect?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.offsetWidth;
    const h = w * aspect;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // paper base
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e7e6e0";
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    // faux text lines so the page reads as a page
    ctx.fillStyle = "#f1f0ea";
    const lineH = h / 28;
    for (let i = 2; i < 26; i++) {
      const width = i % 7 === 0 ? 0.55 : 0.82;
      ctx.fillRect(w * 0.09, i * lineH, w * width, lineH * 0.42);
    }

    paintHeat(ctx, w, h, samples);
    setPainted(true);
  }, [samples, aspect]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-md border opacity-0 transition-opacity duration-[var(--dur-reveal)] ease-[var(--ease-out-soft)] data-[painted=true]:opacity-100"
      data-painted={painted}
    />
  );
}
