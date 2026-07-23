"use client";

import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

const LINE_WIDTH = 2;
const EXPORT_SCALE = 2;
const EXPORT_PAD = 12;
// How far outside the canvas a stroke may BEGIN and still count. Real
// signatures routinely start a flourish above or below the box; strokes
// starting on buttons/inputs are never captured.
const GRACE = 28;

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Point[][],
  map: (p: Point) => Point
) {
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#16181d";
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    ctx.beginPath();
    const first = map(stroke[0]);
    ctx.moveTo(first.x, first.y);
    if (stroke.length === 1) ctx.lineTo(first.x + 0.1, first.y + 0.1);
    for (let i = 1; i < stroke.length; i++) {
      const p = map(stroke[i]);
      ctx.lineTo(p.x, p.y);
    }
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
  const [hasInk, setHasInk] = useState(false);
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
    // faint baseline guide so signatures land mid-pad
    if (all.length === 0) {
      const h = canvas.offsetHeight;
      const w = canvas.offsetWidth;
      ctx.strokeStyle = "rgba(22,24,29,0.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(16, h * 0.72);
      ctx.lineTo(w - 16, h * 0.72);
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
      setHasInk(true);
    };
    const up = () => {
      if (!current.current) return;
      strokes.current.push(current.current);
      current.current = null;
      redraw();
      setHasInk(true);
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

  return (
    <div className="space-y-1.5">
      <canvas
        ref={canvasRef}
        className="h-40 w-full cursor-crosshair touch-none rounded-md border bg-white"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Draw your signature above
        </span>
        {hasInk && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => {
              strokes.current = [];
              current.current = null;
              redraw();
              setHasInk(false);
              onChange(null);
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
