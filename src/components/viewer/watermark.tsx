"use client";

/** Tiled, rotated identity watermark over protected content. */
export function Watermark({ text }: { text: string }) {
  const stamp = `${text} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      <div className="absolute -inset-1/2 grid rotate-[-30deg] grid-cols-3 gap-x-16 gap-y-24 opacity-[0.07]">
        {Array.from({ length: 60 }).map((_, i) => (
          <span
            key={i}
            className="whitespace-nowrap font-mono text-sm font-semibold text-black dark:text-white"
          >
            {stamp}
          </span>
        ))}
      </div>
    </div>
  );
}
