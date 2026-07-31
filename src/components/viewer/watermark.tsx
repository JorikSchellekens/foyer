"use client";

/** Tiled, rotated identity watermark over protected content. */
export function Watermark({ text }: { text: string }) {
  const stamp = `${text} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden"
    >
      {/*
       * Two offset layers rather than one flat grey. The ink layer is what you
       * read over white paper; the pale layer, a hair below and to the right,
       * is what survives over a dark page, a photo or a chart. Plain alpha, no
       * blend modes: those get isolated by the stacking context this overlay
       * sits in, and would silently vanish.
       */}
      <Tile stamp={stamp} color="rgba(255,255,255,0.22)" offset />
      <Tile stamp={stamp} color="rgba(22,24,29,0.11)" />
    </div>
  );
}

function Tile({
  stamp,
  color,
  offset = false,
}: {
  stamp: string;
  color: string;
  offset?: boolean;
}) {
  return (
    <div
      className={`absolute -inset-1/2 grid rotate-[-30deg] grid-cols-2 gap-x-12 gap-y-20 sm:grid-cols-3 sm:gap-x-16 sm:gap-y-24 ${
        offset ? "translate-x-px translate-y-px" : ""
      }`}
    >
      {Array.from({ length: 60 }).map((_, i) => (
        <span
          key={i}
          className="whitespace-nowrap font-mono text-[11px] font-semibold tracking-[0.04em] sm:text-[13px]"
          style={{ color }}
        >
          {stamp}
        </span>
      ))}
    </div>
  );
}
