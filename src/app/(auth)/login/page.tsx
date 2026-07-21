"use client";

import { useActionState } from "react";
import { requestMagicLink, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailCheck } from "lucide-react";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    requestMagicLink,
    null
  );

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="px-8 py-6">
        <span className="font-display italic text-2xl tracking-tight">
          Foyer
        </span>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-4xl leading-tight tracking-tight">
            The room where your documents are received.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in with your email. No passwords here.
          </p>

          {state?.ok ? (
            <div className="mt-10 flex items-start gap-3 rounded-lg border bg-card p-4">
              <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed">{state.message}</p>
            </div>
          ) : (
            <form action={action} className="mt-10 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </div>
              {state && !state.ok && (
                <p className="text-sm text-destructive">{state.message}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Sending link…" : "Email me a sign-in link"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
