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

// Keyboard nudge step, as a fraction of the page. Shift moves a coarse step.
const NUDGE = 0.002;
const NUDGE_COARSE = 0.01;
// How close two edges must be before the alignment guide is drawn. Purely a
// cue: nothing is snapped, the pointer stays in charge of the coordinates.
const ALIGN_TOL = 0.006;

const EDIT_LABELS: Partial<Record<FieldKind, string>> = {
  SIGNATURE: "Sign",
  INITIALS: "Initials",
  DATE_SIGNED: "Date",
  TEXT: "Text",
};

/** Edges of `f` that line up with an edge of any other field on its page. */
function alignmentGuides(f: CanvasField, others: CanvasField[]) {
  const xs = new Set<number>();
  const ys = new Set<number>();
  const mine = {
    x: [f.xPct, f.xPct + f.wPct / 2, f.xPct + f.wPct],
    y: [f.yPct, f.yPct + f.hPct / 2, f.yPct + f.hPct],
  };
  for (const o of others) {
    for (const edge of [o.xPct, o.xPct + o.wPct / 2, o.xPct + o.wPct])
      if (mine.x.some((m) => Math.abs(m - edge) < ALIGN_TOL)) xs.add(edge);
    for (const edge of [o.yPct, o.yPct + o.hPct / 2, o.yPct + o.hPct])
      if (mine.y.some((m) => Math.abs(m - edge) < ALIGN_TOL)) ys.add(edge);
  }
  return { xs: [...xs], ys: [...ys] };
}

/**
 * All pages of a PDF stacked vertically, each with an absolutely-positioned
 * overlay whose children are placed with % coordinates - the same pct-rect
 * space stored on SignatureField, so the overlay survives any zoom/resize.
 *
 * edit mode: click a page to place the armed field, pointer-drag to move,
 * corner handle to resize, arrow keys to nudge the selection.
 * fill mode: fields render via `renderFill` inside a tinted, labelled box.
 * Pointer events (not HTML5 DnD) keep it touch-friendly and scriptable.
 */
export function PdfFieldCanvas({
  fileUrl,
  fields,
  mode,
  signerColorIndex,
  armedKind,
  selectedId,
  filledIds,
  arrivalTick,
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
  /** fill: which fields already hold a value, for the completed presentation */
  filledIds?: Set<string>;
  /** fill: bumped each time the signer is sent to `selectedId`, to re-cue it */
  arrivalTick?: number;
  onPlace?: (page: number, xPct: number, yPct: number) => void;
  onChange?: (id: string, rect: Partial<CanvasField>) => void;
  onSelect?: (id: string | null) => void;
  /** fill: render the interactive contents of a field box */
  renderFill?: (field: CanvasField) => ReactNode;
}) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(720);
  const [dragId, setDragId] = useState<string | null>(null);
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

  // A pointer released off the overlay (or outside the window) must still end
  // the drag, otherwise the next move would resume it.
  useEffect(() => {
    const end = () => {
      if (!drag.current) return;
      drag.current = null;
      setDragId(null);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

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
    setDragId(field.id);
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

  function nudge(e: React.KeyboardEvent, f: CanvasField) {
    if (mode !== "edit") return;
    const step = e.shiftKey ? NUDGE_COARSE : NUDGE;
    const dx =
      e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    onChange?.(f.id, {
      xPct: Math.min(1 - f.wPct, Math.max(0, f.xPct + dx)),
      yPct: Math.min(1 - f.hPct, Math.max(0, f.yPct + dy)),
    });
  }

  const dragField = dragId ? fields.find((f) => f.id === dragId) : undefined;

  return (
    <div ref={frameRef} className="h-full overflow-auto bg-muted/40 p-2">
      <Document
        file={fileUrl}
        onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
        loading={
          <div className="flex flex-col items-center gap-3 py-24">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Opening document</p>
          </div>
        }
        error={
          <p className="py-24 text-center text-sm text-muted-foreground">
            This document could not be displayed.
          </p>
        }
      >
        <div className="mx-auto space-y-5" style={{ width }}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
            const guides =
              dragField && dragField.page === p
                ? alignmentGuides(
                    dragField,
                    fields.filter((f) => f.page === p && f.id !== dragField.id)
                  )
                : null;
            return (
              <div key={p} className="space-y-1">
                {numPages > 1 && (
                  <p className="px-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                    Page {p} / {numPages}
                  </p>
                )}
                <div
                  data-sign-page={p}
                  className="relative shadow-[var(--shadow-float)]"
                >
                  <Page
                    pageNumber={p}
                    width={width}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={
                      <div
                        style={{ width, height: width * 1.294 }}
                        className="shimmer bg-white"
                      />
                    }
                  />
                  {/* the pct-coordinate overlay */}
                  <div
                    className={`absolute inset-0 ${
                      mode === "edit" && armedKind ? "cursor-crosshair" : ""
                    }`}
                    onPointerMove={(e) => moveDrag(e, e.currentTarget)}
                    onPointerUp={() => {
                      drag.current = null;
                      setDragId(null);
                    }}
                    onClick={(e) => {
                      if (mode !== "edit") return;
                      if (armedKind) {
                        const { x, y } = pctPoint(
                          e.currentTarget,
                          e.clientX,
                          e.clientY
                        );
                        onPlace?.(p, x, y);
                      } else {
                        onSelect?.(null);
                      }
                    }}
                  >
                    {/* alignment cues, drawn only while dragging */}
                    {guides?.xs.map((x) => (
                      <span
                        key={`x${x}`}
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 w-px bg-primary/45"
                        style={{ left: `${x * 100}%` }}
                      />
                    ))}
                    {guides?.ys.map((y) => (
                      <span
                        key={`y${y}`}
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 h-px bg-primary/45"
                        style={{ top: `${y * 100}%` }}
                      />
                    ))}

                    {fields
                      .filter((f) => f.page === p)
                      .map((f) => {
                        const color = signerColor(
                          signerColorIndex[f.signerId] ?? 0
                        );
                        const selected = f.id === selectedId;
                        const filled = filledIds?.has(f.id) ?? false;
                        const editing = mode === "edit";
                        return (
                          <div
                            key={f.id}
                            data-sign-field={f.id}
                            data-sign-kind={f.kind}
                            data-sign-filled={filled ? "true" : undefined}
                            tabIndex={editing ? 0 : -1}
                            role={editing ? "button" : undefined}
                            aria-label={
                              editing
                                ? `${EDIT_LABELS[f.kind] ?? f.kind} field on page ${p}`
                                : undefined
                            }
                            className={`group/field absolute rounded-sm border transition-[background-color,border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] focus-visible:z-10 focus-visible:shadow-[0_0_0_3px_var(--ring)] focus-visible:outline-none ${
                              editing
                                ? `cursor-move select-none${
                                    selected ? " z-10 ring-2 ring-offset-1" : ""
                                  }`
                                : // A fillable field reads as one at a glance:
                                  // warm accent wash inside a hairline, which
                                  // recedes to a hairline once it holds a value.
                                  `focus-within:z-10 ${
                                    filled
                                      ? "border-primary/25 bg-transparent hover:bg-primary/[0.06]"
                                      : "border-primary/55 bg-primary/[0.07] hover:bg-primary/[0.14]"
                                  }${
                                    selected
                                      ? " z-10 ring-2 ring-primary/60 ring-offset-1"
                                      : ""
                                  }`
                            }`}
                            style={{
                              left: `${f.xPct * 100}%`,
                              top: `${f.yPct * 100}%`,
                              width: `${f.wPct * 100}%`,
                              height: `${f.hPct * 100}%`,
                              ...(editing
                                ? {
                                    borderColor: color.border,
                                    background: color.bg,
                                    ...(selected
                                      ? ({
                                          "--tw-ring-color": color.border,
                                        } as React.CSSProperties)
                                      : {}),
                                  }
                                : {}),
                            }}
                            onPointerDown={(e) => beginDrag(e, f, "move")}
                            onFocus={() => editing && onSelect?.(f.id)}
                            onKeyDown={(e) => nudge(e, f)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {mode === "fill" ? (
                              renderFill?.(f)
                            ) : (
                              <span
                                className="pointer-events-none absolute left-0 top-0 max-w-full truncate px-1 text-[10px] leading-4"
                                style={{ color: color.border }}
                              >
                                {EDIT_LABELS[f.kind] ?? ""}
                              </span>
                            )}
                            {/* An empty required field stays findable: a small
                                accent dot that leaves once it is filled. */}
                            {mode === "fill" && f.required && !filled && (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute -right-1 -top-1 size-1.5 rounded-full bg-primary"
                              />
                            )}
                            {/* Arrival cue for guided navigation. Keyed on the
                                tick so returning to the same field re-plays. */}
                            {mode === "fill" && selected && (
                              <span
                                key={arrivalTick}
                                aria-hidden
                                className="pointer-events-none absolute -inset-px rounded-sm animate-[pulse-ring_1.1s_var(--ease-out-soft)_2]"
                              />
                            )}
                            {editing && (
                              <div
                                data-sign-resize
                                aria-hidden
                                className={`absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-full border bg-background transition-opacity duration-[var(--dur-fast)] ${
                                  selected
                                    ? "opacity-100"
                                    : "opacity-0 group-hover/field:opacity-100 group-focus-visible/field:opacity-100"
                                }`}
                                style={{ borderColor: color.border }}
                                onPointerDown={(e) => beginDrag(e, f, "resize")}
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Document>
    </div>
  );
}
