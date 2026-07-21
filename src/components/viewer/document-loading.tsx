/**
 * Shared loading state for the viewer. Fills its container and centres a
 * page-shaped skeleton so the wait reads as "a document is on its way" rather
 * than a spinner pinned to the top-left. Used by the PDF viewer, the simple
 * viewers, and the dynamic-import fallback so every file type loads the same way.
 */
export function DocumentLoading({ label = "Preparing document…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-72 w-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mx-auto aspect-[1/1.294] w-full max-w-[280px] animate-pulse space-y-3.5 rounded-lg border border-white/10 bg-white/[0.035] p-7 shadow-2xl">
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
        <p className="mt-6 text-center text-[13px] font-medium tracking-wide text-white/45">
          {label}
        </p>
      </div>
    </div>
  );
}
