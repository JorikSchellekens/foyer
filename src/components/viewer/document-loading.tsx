/**
 * Shared loading state for the viewer. Fills its container and centres a
 * page-shaped skeleton so the wait reads as "a document is on its way" rather
 * than a spinner pinned to the top-left. Used by the PDF viewer, the simple
 * viewers, and the dynamic-import fallback so every file type loads the same way.
 *
 * `progress` (0-100) turns the indicator determinate: worth passing for large
 * files, where an indeterminate skeleton starts to read as broken.
 */
export function DocumentLoading({
  label = "Preparing document…",
  progress = null,
}: {
  label?: string;
  progress?: number | null;
}) {
  const pct = progress === null ? null : Math.min(100, Math.max(0, progress));
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex size-full min-h-72 items-center justify-center p-8"
    >
      <div className="w-full max-w-sm reveal">
        {/*
         * animate-pulse rather than .shimmer: the sheen in .shimmer is mixed
         * from --foreground, which inverts with the theme and would vanish
         * against this permanently dark chrome.
         */}
        <div className="mx-auto aspect-[1/1.294] w-full max-w-[280px] animate-pulse space-y-3.5 rounded-lg border border-white/10 bg-white/[0.035] p-7 shadow-[0_1px_2px_rgb(0_0_0/0.35),0_16px_40px_-16px_rgb(0_0_0/0.55)]">
          <div className="h-4 w-2/3 rounded bg-white/15" />
          <div className="space-y-2.5 pt-3">
            <div className="h-2.5 w-full rounded bg-white/[0.08]" />
            <div className="h-2.5 w-full rounded bg-white/[0.08]" />
            <div className="h-2.5 w-5/6 rounded bg-white/[0.08]" />
            <div className="h-2.5 w-11/12 rounded bg-white/[0.08]" />
            <div className="h-2.5 w-3/4 rounded bg-white/[0.08]" />
          </div>
          <div className="space-y-2.5 pt-4">
            <div className="h-2.5 w-full rounded bg-white/[0.08]" />
            <div className="h-2.5 w-4/5 rounded bg-white/[0.08]" />
          </div>
        </div>
        <div className="mx-auto mt-6 w-full max-w-[280px]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium tracking-wide text-white/45">
              {label}
            </p>
            {pct !== null && (
              <span className="font-mono text-[11px] tabular text-white/35">
                {pct}%
              </span>
            )}
          </div>
          {/* Hairline meter: determinate once the transfer reports a total. */}
          <div className="mt-2.5 h-px w-full overflow-hidden bg-white/10">
            <div
              className={`h-full bg-white/40 transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out-quint)] ${
                pct === null ? "w-1/4 animate-pulse" : ""
              }`}
              style={pct === null ? undefined : { width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
