"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Workspace-level fallback. It stays inside the shell (the sidebar keeps
 * working), names what happened without a stack trace, and leads with the
 * action that usually fixes it: retry, which re-fetches this segment.
 *
 * `unstable_retry` re-runs the failed render; `reset` only clears the boundary.
 * Prefer the former where the running Next provides it.
 */
export default function AppError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  const retry = unstable_retry ?? reset;
  return (
    <div className="flex min-h-[70svh] items-center justify-center px-4 py-16 sm:px-8">
      <div className="reveal-up w-full max-w-md rounded-xl border bg-card p-6 shadow-[var(--shadow-raise)]">
        <span className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-4" />
        </span>
        <h1 className="mt-4 font-display text-2xl leading-snug tracking-tight">
          This page did not finish loading
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Nothing was changed. Trying again is usually enough; if it keeps
          happening, the server log will have the matching entry.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button size="lg" className="h-10 px-5" onClick={() => retry()}>
            Try again
          </Button>
          <Button asChild size="lg" variant="ghost" className="h-10 px-4">
            <Link href="/dashboard">Back to overview</Link>
          </Button>
        </div>
        {error.digest && (
          <p className="tabular mt-5 border-t pt-4 font-mono text-xs text-muted-foreground">
            Reference {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
