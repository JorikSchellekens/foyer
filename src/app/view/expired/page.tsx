import { TimerOff } from "lucide-react";
import { FoyerLogo, FoyerMark } from "@/components/brand/logo";

export const metadata = { title: "Link expired" };

/**
 * The dead end a real prospect hits. Paper rather than the viewer's dark
 * chrome: nothing has gone wrong with them, the invitation simply ran out.
 */
export default function ExpiredPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-16 text-foreground">
      <div className="reveal mb-10 opacity-80">
        <FoyerLogo size="md" />
      </div>
      <div className="reveal-up w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-[var(--shadow-float)]">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
          <TimerOff className="size-5 text-muted-foreground" strokeWidth={1.5} />
        </span>
        <h1 className="mt-5 font-display text-3xl leading-tight">
          This link has expired
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The invitation is no longer valid. The documents are still there: ask
          the person who shared them to send a fresh link, and it will open
          straight away.
        </p>
        <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          Replying to the email that brought you here is usually the fastest way
          to get a new one.
        </p>
      </div>
      <p className="mt-10 flex items-center gap-1.5 text-xs text-muted-foreground">
        <FoyerMark className="size-3" />
        Secured by Foyer
      </p>
    </main>
  );
}
