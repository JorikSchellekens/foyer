"use client";

import { useEffect, useRef, useState } from "react";
import { paintHeat } from "./mouse-heatmap";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Attention overlay on continuous documents (Word, plain text): the file is
 * converted exactly as the viewer converts it, and heat is painted over the
 * full rendered body so percentages line up with what the visitor saw.
 */
export function ContentHeatmap({
  fileUrl,
  kind,
  samples,
}: {
  fileUrl: string;
  kind: "DOCX" | "TEXT";
  samples: [number, number][];
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [painted, setPainted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error();
        if (kind === "DOCX") {
          const buf = await res.arrayBuffer();
          const mammoth = (await import("mammoth/mammoth.browser")) as {
            convertToHtml: (o: {
              arrayBuffer: ArrayBuffer;
            }) => Promise<{ value: string }>;
          };
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          setHtml(result.value);
        } else {
          setText((await res.text()).slice(0, 500_000));
        }
      } catch {
        setError(true);
      }
    })();
  }, [fileUrl, kind]);

  const ready = html !== null || text !== null;

  useEffect(() => {
    if (!ready) return;
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
      setPainted(true);
    };
    paint();
    const obs = new ResizeObserver(paint);
    obs.observe(wrap);
    return () => obs.disconnect();
  }, [ready, samples]);

  if (error)
    return (
      <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        The document could not be rendered for the attention map.
      </p>
    );
  if (!ready)
    // Document-shaped skeleton at the real column width: the conversion runs in
    // the browser, so this is on screen for a beat on larger files.
    return (
      <div
        aria-busy
        className="max-w-2xl space-y-3 rounded-md border bg-card p-8"
      >
        {[92, 100, 78, 96, 64, 100, 86].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
    );

  return (
    <div
      ref={wrapRef}
      className="reveal relative max-w-2xl overflow-hidden rounded-md border bg-white shadow-[var(--shadow-hairline)]"
    >
      {html !== null ? (
        <article
          className="content-heat-doc p-8 text-neutral-900"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="whitespace-pre-wrap p-8 font-mono text-[12px] leading-relaxed text-neutral-900">
          {text}
        </pre>
      )}
      <canvas
        ref={overlayRef}
        data-painted={painted}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-[var(--dur-reveal)] ease-[var(--ease-out-soft)] data-[painted=true]:opacity-100"
      />
      <style jsx global>{`
        .content-heat-doc {
          font-family: Georgia, serif;
          line-height: 1.65;
          font-size: 14px;
        }
        .content-heat-doc h1,
        .content-heat-doc h2,
        .content-heat-doc h3 {
          margin: 1.2em 0 0.5em;
          line-height: 1.25;
        }
        .content-heat-doc h1 { font-size: 1.7em; }
        .content-heat-doc h2 { font-size: 1.35em; }
        .content-heat-doc p { margin: 0.6em 0; }
        .content-heat-doc table { border-collapse: collapse; margin: 1em 0; }
        .content-heat-doc td,
        .content-heat-doc th { border: 1px solid #ddd; padding: 5px 9px; }
        .content-heat-doc img { max-width: 100%; }
        .content-heat-doc ul,
        .content-heat-doc ol { padding-left: 1.4em; margin: 0.6em 0; }
      `}</style>
    </div>
  );
}
