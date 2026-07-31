"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Point = { x: number; y: number };

const LINE_WIDTH = 2;
// Ink width envelope. A slow stroke lays down more ink than a fast one, which
// is what makes a drawn line read as a pen rather than a mouse trail. Kept
// well inside EXPORT_PAD so a thick stroke can never clip on export.
const MIN_WIDTH = LINE_WIDTH * 0.6;
const MAX_WIDTH = LINE_WIDTH * 1.5;
// Pointer travel per sample (in CSS px) that reaches the thinnest width.
const FAST_TRAVEL = 12;
const EXPORT_SCALE = 2;
const EXPORT_PAD = 12;
// How far outside the canvas a stroke may BEGIN and still count. Real
// signatures routinely start a flourish above or below the box; strokes
// starting on buttons/inputs are never captured.
const GRACE = 28;

const INK = "#16181d";

const mid = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/**
 * Render the stroke model as ink. Each recorded point becomes the control
 * point of a quadratic between its neighbouring midpoints, so the captured
 * polyline shows no corners, and the width eases towards a speed-derived
 * target so the line tapers instead of stepping. Purely presentational: the
 * points, and therefore the exported extent, are untouched.
 */
function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Point[][],
  map: (p: Point) => Point
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    const pts = stroke.map(map);
    if (pts.length === 1) {
      // A tap is a dot, not a zero-length line.
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, LINE_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    let w = LINE_WIDTH;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const p = pts[i];
      const travel = Math.hypot(p.x - prev.x, p.y - prev.y);
      const target =
        MAX_WIDTH - (MAX_WIDTH - MIN_WIDTH) * Math.min(1, travel / FAST_TRAVEL);
      w += (target - w) * 0.35;
      const from = i === 1 ? prev : mid(pts[i - 2], prev);
      const to = mid(prev, p);
      ctx.beginPath();
      ctx.lineWidth = w;
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(prev.x, prev.y, to.x, to.y);
      ctx.stroke();
    }
    // Carry the last midpoint out to the final point so the stroke ends where
    // the pointer did.
    const last = pts[pts.length - 1];
    const penultimate = pts[pts.length - 2];
    ctx.beginPath();
    ctx.lineWidth = w;
    const tail = mid(penultimate, last);
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

/** Ink-cropped PNG of the strokes: trimmed to the drawn extent plus a small
 * pad, at 2x - so a small squiggle in a big pad still fills its field box. */
function exportStrokes(strokes: Point[][]): string | null {
  const pts = strokes.flat();
  if (pts.length === 0) return null;
  const minX = Math.min(...pts.map((p) => p.x)) - EXPORT_PAD;
  const minY = Math.min(...pts.map((p) => p.y)) - EXPORT_PAD;
  const maxX = Math.max(...pts.map((p) => p.x)) + EXPORT_PAD;
  const maxY = Math.max(...pts.map((p) => p.y)) + EXPORT_PAD;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((maxX - minX) * EXPORT_SCALE));
  canvas.height = Math.max(1, Math.round((maxY - minY) * EXPORT_SCALE));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  drawStrokes(ctx, strokes, (p) => ({ x: p.x - minX, y: p.y - minY }));
  return canvas.toDataURL("image/png");
}

/**
 * Drawing pad backed by a stroke model: the canvas is only a view, redrawn
 * from recorded points, so buffer resizes never lose ink. Strokes are
 * captured on window-level pointer listeners with a grace zone around the
 * canvas - a stroke that begins slightly outside the box (a fast flourish,
 * a crossed t) still registers instead of being silently dropped.
 */
export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const current = useRef<Point[] | null>(null);
  const onChangeRef = useRef(onChange);
  // Stroke count rather than a boolean: undo needs to know how much is left.
  const [strokeCount, setStrokeCount] = useState(0);
  const hasInk = strokeCount > 0;
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const all = current.current
      ? [...strokes.current, current.current]
      : strokes.current;
    drawStrokes(ctx, all, (p) => p);
    // Faint baseline guide so signatures land mid-pad, with the cross that
    // marks the signing line on paper forms.
    if (all.length === 0) {
      const h = canvas.offsetHeight;
      const w = canvas.offsetWidth;
      const y = h * 0.72;
      ctx.strokeStyle = "rgba(22,24,29,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16, y - 5);
      ctx.lineTo(26, y + 5);
      ctx.moveTo(26, y - 5);
      ctx.lineTo(16, y + 5);
      ctx.stroke();
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(32, y);
      ctx.lineTo(w - 16, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  // Size the buffer to the element (and re-render the model) on mount and on
  // any resize - strokes survive because the canvas is just a projection.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, canvas.offsetWidth * dpr);
      canvas.height = Math.max(1, canvas.offsetHeight * dpr);
      redraw();
    };
    fit();
    const obs = new ResizeObserver(fit);
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

  // Window-level stroke capture with the grace zone.
  useEffect(() => {
    const clamp = (clientX: number, clientY: number): Point => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return {
        x: Math.min(rect.width, Math.max(0, clientX - rect.left)),
        y: Math.min(rect.height, Math.max(0, clientY - rect.top)),
      };
    };
    const down = (e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || e.button !== 0) return;
      // Hidden (a tab switch collapses it to 0x0): its rect would sit at the
      // viewport origin and swallow unrelated presses.
      if (!canvas.offsetWidth || !canvas.offsetHeight) return;
      const r = canvas.getBoundingClientRect();
      if (
        e.clientX < r.left - GRACE ||
        e.clientX > r.right + GRACE ||
        e.clientY < r.top - GRACE ||
        e.clientY > r.bottom + GRACE
      )
        return;
      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      // In the grace ring, never steal presses meant for controls.
      if (
        !inside &&
        (e.target as HTMLElement).closest(
          "button, a, input, textarea, select, [role='tab']"
        )
      )
        return;
      e.preventDefault();
      current.current = [clamp(e.clientX, e.clientY)];
      redraw();
    };
    const move = (e: PointerEvent) => {
      if (!current.current) return;
      current.current.push(clamp(e.clientX, e.clientY));
      redraw();
    };
    const up = () => {
      if (!current.current) return;
      strokes.current.push(current.current);
      current.current = null;
      redraw();
      setStrokeCount(strokes.current.length);
      onChangeRef.current(exportStrokes(strokes.current));
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const undo = () => {
    strokes.current = strokes.current.slice(0, -1);
    current.current = null;
    redraw();
    setStrokeCount(strokes.current.length);
    onChangeRef.current(exportStrokes(strokes.current));
  };

  const clear = () => {
    strokes.current = [];
    current.current = null;
    redraw();
    setStrokeCount(0);
    onChangeRef.current(null);
  };

  return (
    <div className="space-y-1.5">
      <canvas
        ref={canvasRef}
        aria-label="Signature drawing area"
        className="h-40 w-full cursor-crosshair touch-none rounded-md border bg-white transition-colors duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:border-input sm:h-44"
      />
      <div className="flex min-h-6 items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {hasInk
            ? "Draw again to add to your signature"
            : "Draw your signature above"}
        </span>
        <div
          className={`flex items-center gap-1 transition-opacity duration-[var(--dur)] ${
            hasInk ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={undo}
            tabIndex={hasInk ? 0 : -1}
          >
            <Undo2 /> Undo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={clear}
            tabIndex={hasInk ? 0 : -1}
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
