"use client";

import { useEffect, useRef } from "react";

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

  // colorize alpha -> green→amber→oxblood ramp
  const img = hctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] / 255;
    if (a <= 0.02) continue;
    const t = Math.min(a * 1.8, 1);
    let r: number, g: number, b: number;
    if (t < 0.5) {
      const k = t / 0.5;
      r = 23 + (183 - 23) * k;
      g = 91 + (121 - 91) * k;
      b = 71 + (31 - 71) * k;
    } else {
      const k = (t - 0.5) / 0.5;
      r = 183 + (147 - 183) * k;
      g = 121 + (50 - 121) * k;
      b = 31;
    }
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = Math.min(t * 210, 210);
  }
  const overlay = document.createElement("canvas");
  overlay.width = w;
  overlay.height = h;
  overlay.getContext("2d")!.putImageData(out, 0, 0);
  ctx.drawImage(overlay, 0, 0);
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
  }, [samples, aspect]);

  return <canvas ref={canvasRef} className="w-full rounded-md" />;
}
