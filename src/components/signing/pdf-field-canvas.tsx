"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import { signerColor, type FieldKind } from "@/lib/sign-fields";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export type CanvasField = {
  id: string;
  signerId: string;
  kind: FieldKind;
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  required: boolean;
};

type DragState = {
  fieldId: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  rect: { xPct: number; yPct: number; wPct: number; hPct: number };
};

/**
 * All pages of a PDF stacked vertically, each with an absolutely-positioned
 * overlay whose children are placed with % coordinates - the same pct-rect
 * space stored on SignatureField, so the overlay survives any zoom/resize.
 *
 * edit mode: click a page to place the armed field, pointer-drag to move,
 * corner handle to resize. fill mode: fields render via `renderFill`.
 * Pointer events (not HTML5 DnD) keep it touch-friendly and scriptable.
 */
export function PdfFieldCanvas({
  fileUrl,
  fields,
  mode,
  signerColorIndex,
  armedKind,
  selectedId,
  onPlace,
  onChange,
  onSelect,
  renderFill,
}: {
  fileUrl: string;
  fields: CanvasField[];
  mode: "edit" | "fill";
  /** signerId -> palette index, for per-recipient tinting */
  signerColorIndex: Record<string, number>;
  /** edit: field kind placed on next page click (null = nothing armed) */
  armedKind?: FieldKind | null;
  selectedId?: string | null;
  onPlace?: (page: number, xPct: number, yPct: number) => void;
  onChange?: (id: string, rect: Partial<CanvasField>) => void;
  onSelect?: (id: string | null) => void;
  /** fill: render the interactive contents of a field box */
  renderFill?: (field: CanvasField) => ReactNode;
}) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(720);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(320, el.clientWidth - 16));
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [numPages]);

  function pctPoint(pageEl: HTMLElement, clientX: number, clientY: number) {
    const r = pageEl.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  }

  function beginDrag(
    e: React.PointerEvent,
    field: CanvasField,
    dragMode: "move" | "resize"
  ) {
    if (mode !== "edit") return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      fieldId: field.id,
      mode: dragMode,
      startX: e.clientX,
      startY: e.clientY,
      rect: { xPct: field.xPct, yPct: field.yPct, wPct: field.wPct, hPct: field.hPct },
    };
    onSelect?.(field.id);
  }

  function moveDrag(e: React.PointerEvent, pageEl: HTMLElement) {
    const d = drag.current;
    if (!d) return;
    const r = pageEl.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / r.width;
    const dy = (e.clientY - d.startY) / r.height;
    if (d.mode === "move") {
      onChange?.(d.fieldId, {
        xPct: Math.min(1 - d.rect.wPct, Math.max(0, d.rect.xPct + dx)),
        yPct: Math.min(1 - d.rect.hPct, Math.max(0, d.rect.yPct + dy)),
      });
    } else {
      onChange?.(d.fieldId, {
        wPct: Math.min(1 - d.rect.xPct, Math.max(0.02, d.rect.wPct + dx)),
        hPct: Math.min(1 - d.rect.yPct, Math.max(0.012, d.rect.hPct + dy)),
      });
    }
  }

  return (
    <div ref={frameRef} className="h-full overflow-auto bg-muted/40 p-2">
      <Document
        file={fileUrl}
        onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
        loading={
          <div className="flex justify-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        }
        error={
          <p className="py-24 text-center text-sm text-muted-foreground">
            This document could not be displayed.
          </p>
        }
      >
        <div className="mx-auto space-y-4" style={{ width }}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
            <div key={p} data-sign-page={p} className="relative shadow-md">
              <Page
                pageNumber={p}
                width={width}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={
                  <div style={{ width, height: width * 1.294 }} className="bg-white" />
                }
              />
              {/* the pct-coordinate overlay */}
              <div
                className={`absolute inset-0 ${
                  mode === "edit" && armedKind ? "cursor-crosshair" : ""
                }`}
                onPointerMove={(e) => moveDrag(e, e.currentTarget)}
                onPointerUp={() => (drag.current = null)}
                onClick={(e) => {
                  if (mode !== "edit") return;
                  if (armedKind) {
                    const { x, y } = pctPoint(e.currentTarget, e.clientX, e.clientY);
                    onPlace?.(p, x, y);
                  } else {
                    onSelect?.(null);
                  }
                }}
              >
                {fields
                  .filter((f) => f.page === p)
                  .map((f) => {
                    const color = signerColor(signerColorIndex[f.signerId] ?? 0);
                    const selected = f.id === selectedId;
                    return (
                      <div
                        key={f.id}
                        data-sign-field={f.id}
                        data-sign-kind={f.kind}
                        className={`absolute rounded-sm border ${
                          mode === "edit" ? "cursor-move select-none" : ""
                        } ${selected ? "ring-2 ring-offset-1" : ""}`}
                        style={{
                          left: `${f.xPct * 100}%`,
                          top: `${f.yPct * 100}%`,
                          width: `${f.wPct * 100}%`,
                          height: `${f.hPct * 100}%`,
                          borderColor: color.border,
                          background: mode === "fill" ? "transparent" : color.bg,
                          ...(selected
                            ? ({ "--tw-ring-color": color.border } as React.CSSProperties)
                            : {}),
                        }}
                        onPointerDown={(e) => beginDrag(e, f, "move")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {mode === "fill" ? (
                          renderFill?.(f)
                        ) : (
                          <span
                            className="pointer-events-none absolute left-0 top-0 max-w-full truncate px-1 text-[10px] leading-4"
                            style={{ color: color.border }}
                          >
                            {f.kind === "SIGNATURE"
                              ? "Sign"
                              : f.kind === "INITIALS"
                                ? "Initials"
                                : f.kind === "DATE_SIGNED"
                                  ? "Date"
                                  : f.kind === "TEXT"
                                    ? "Text"
                                    : ""}
                          </span>
                        )}
                        {mode === "edit" && selected && (
                          <div
                            data-sign-resize
                            className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-full border bg-background"
                            style={{ borderColor: color.border }}
                            onPointerDown={(e) => beginDrag(e, f, "resize")}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </Document>
    </div>
  );
}
