import { formatDuration } from "@/lib/format";

/**
 * Per-page reading time, set like a book index: page number, dot leaders,
 * time. The bar underneath shows relative attention.
 */
export function PageDwell({
  pages,
}: {
  pages: { pageNumber: number; avgSeconds: number; views: number }[];
}) {
  if (pages.length === 0)
    return (
      <p className="px-1 py-6 text-sm text-muted-foreground">
        Page-level timing appears after the first visit.
      </p>
    );
  const max = Math.max(...pages.map((p) => p.avgSeconds), 1);
  return (
    <div className="space-y-2.5">
      {pages.map((p) => (
        <div key={p.pageNumber}>
          <div className="flex items-baseline text-sm">
            <span className="text-muted-foreground">
              Page {p.pageNumber}
            </span>
            <span className="leader-dots" aria-hidden />
            <span className="font-mono text-xs tabular text-muted-foreground">
              {formatDuration(p.avgSeconds)} avg · {p.views}{" "}
              {p.views === 1 ? "reader" : "readers"}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-2"
              style={{ width: `${Math.max((p.avgSeconds / max) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
