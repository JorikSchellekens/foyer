"use client";

import { Button } from "@/components/ui/button";
import { FoyerLogo } from "@/components/brand/logo";

/**
 * Sign-in and onboarding fallback. Same column as the pages it stands in for,
 * so a failure here does not look like a different product. No email has been
 * sent and no workspace created when this shows, which is worth saying.
 */
export default function AuthError({
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
    <main className="flex min-h-svh flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-6 pb-24 pt-16">
        <div className="reveal-up w-full max-w-sm">
          <FoyerLogo size="lg" />
          <h1 className="mt-10 font-display text-4xl leading-[1.08] tracking-tight text-balance">
            Something interrupted this step
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            No email was sent and nothing was created. Try again, and if it
            persists the server log will have the matching entry.
          </p>
          <Button
            size="lg"
            className="mt-8 h-10 w-full"
            onClick={() => retry()}
          >
            Try again
          </Button>
          {error.digest && (
            <p className="tabular mt-5 font-mono text-xs text-muted-foreground">
              Reference {error.digest}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
