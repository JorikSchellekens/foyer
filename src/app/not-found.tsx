import Link from "next/link";
import { FoyerLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/**
 * Seen by prospects who mistyped or trimmed a shared URL as often as by
 * signed-in users, and on custom domains as well as the app host. So: one
 * plain explanation and a single next step that resolves correctly for all of
 * them, since "/" lands on the dashboard, the sign-in page or the domain root
 * depending on where the visitor is.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-6 pb-24 pt-16 text-center">
      <div className="reveal-up flex w-full max-w-md flex-col items-center">
        <FoyerLogo size="md" />
        <p className="tabular mt-12 font-mono text-xs tracking-[0.2em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.1] tracking-tight text-balance">
          Nothing at this address
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
          Check the address against the one you were given. Shared links are
          exact, and some of them expire or are limited to specific people.
        </p>
        <Button asChild size="lg" className="mt-8 h-10 px-5">
          <Link href="/">Back to Foyer</Link>
        </Button>
      </div>
    </main>
  );
}
