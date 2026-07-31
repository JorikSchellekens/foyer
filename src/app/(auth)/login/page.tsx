"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { requestMagicLink, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MailCheck } from "lucide-react";
import { FoyerLogo } from "@/components/brand/logo";

/** Cascade steps for the arrival; .stagger-item reads --i. */
const STEP = [0, 1, 2, 3].map((i) => ({ "--i": i }) as React.CSSProperties);

/**
 * Why a sign-in attempt bounced back here. The verify route redirects with
 * ?error=… when a link is incomplete or already spent, which is otherwise a
 * silent trip back to an empty form.
 */
const LINK_ERRORS: Record<string, string> = {
  expired:
    "That sign-in link has expired or was already used. Request a new one below.",
  missing: "That sign-in link was incomplete. Request a new one below.",
};

function LinkError() {
  const reason = useSearchParams().get("error");
  const message = reason ? LINK_ERRORS[reason] : undefined;
  if (!message) return null;
  return (
    <p
      role="status"
      className="reveal mt-8 rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm leading-relaxed text-destructive"
    >
      {message}
    </p>
  );
}

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    requestMagicLink,
    null
  );
  // Held locally so the address can be prefilled for a resend and preserved
  // when the visitor comes back to correct a typo.
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [resends, setResends] = useState(0);
  const sent = Boolean(state?.ok) && !editing;

  return (
    <main className="flex min-h-svh flex-col bg-background">
      {/* Bottom padding exceeds top so the column settles just above the
          geometric centre, which is where it reads as centred. */}
      <div className="flex flex-1 items-center justify-center px-6 pb-24 pt-16">
        {/* Arrives in reading order: wordmark, promise, instruction, form. */}
        <div className="w-full max-w-sm">
          <span className="stagger-item block" style={STEP[0]}>
            <FoyerLogo size="lg" />
          </span>
          <h1
            className="stagger-item mt-10 font-display text-4xl leading-[1.08] tracking-tight text-balance"
            style={STEP[1]}
          >
            The room where your documents are received.
          </h1>
          <p
            className="stagger-item mt-3 text-sm text-muted-foreground"
            style={STEP[2]}
          >
            Sign in with your email. No passwords here.
          </p>

          {sent ? (
            <div
              className="stagger-item mt-10 rounded-xl border bg-card p-5 shadow-[var(--shadow-raise)]"
              style={STEP[3]}
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-accent text-primary">
                <MailCheck className="size-4" />
              </span>
              <h2 className="mt-4 font-display text-xl leading-snug">
                Check your inbox
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {state?.message}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm">
                <form action={action} onSubmit={() => setResends((n) => n + 1)}>
                  <input type="hidden" name="email" value={email} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="focus-ring press underline-grow rounded-sm font-medium text-primary disabled:opacity-60"
                  >
                    {pending ? "Resending…" : "Resend link"}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="focus-ring press underline-grow rounded-sm text-muted-foreground hover:text-foreground"
                >
                  Use a different address
                </button>
                {resends > 0 && !pending && (
                  <span className="tick-in text-xs text-muted-foreground">
                    Sent again
                  </span>
                )}
              </div>
            </div>
          ) : (
            <>
              <Suspense fallback={null}>
                <LinkError />
              </Suspense>
              <form
                action={action}
                onSubmit={() => {
                  setEditing(false);
                  setResends(0);
                }}
                className="stagger-item mt-10 space-y-4"
                style={STEP[3]}
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    inputMode="email"
                    spellCheck={false}
                    placeholder="you@company.com"
                    className="h-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={state && !state.ok ? true : undefined}
                    aria-describedby={
                      state && !state.ok ? "login-error" : undefined
                    }
                  />
                </div>
                {state && !state.ok && (
                  <p
                    id="login-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {state.message}
                  </p>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="h-10 w-full"
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Sending link…
                    </>
                  ) : (
                    "Email me a sign-in link"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
