"use client";

import { useEffect, useRef, useState } from "react";

export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16181d";
  }, []);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <div className="space-y-1.5">
      <canvas
        ref={canvasRef}
        className="h-32 w-full cursor-crosshair touch-none rounded-md border bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          const ctx = canvasRef.current!.getContext("2d")!;
          const { x, y } = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current!.getContext("2d")!;
          const { x, y } = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          if (!hasInk) setHasInk(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (canvasRef.current)
            onChange(canvasRef.current.toDataURL("image/png"));
        }}
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
              const canvas = canvasRef.current!;
              const ctx = canvas.getContext("2d")!;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
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
