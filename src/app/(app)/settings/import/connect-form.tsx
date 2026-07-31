"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { connectPapermark } from "./actions";

/**
 * Step one: credentials.
 *
 * Two fields, and the second one needs justifying to the user rather than
 * merely being asked for - pasting a session cookie is an unusual request, so
 * the UI explains exactly why it is needed (Papermark's API serves no file
 * bytes), what it is used for, and that it is deleted when the run ends.
 * Leaving it blank is a first-class choice, not a degraded one.
 */
export function ConnectForm() {
  const router = useRouter();
  const [apiToken, setApiToken] = useState("");
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(
    null
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await connectPapermark({
        apiToken,
        sessionCookie: cookie || undefined,
      });
      if (!res.ok) {
        setError({ field: res.field, message: res.error });
        return;
      }
      toast.success("Connected to Papermark.");
      router.refresh();
    } catch {
      setError({ message: "Something went wrong connecting to Papermark." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-lg border bg-card p-5 shadow-[var(--shadow-hairline)]">
        <Label
          htmlFor="pm-api-token"
          className="flex items-center gap-1.5 text-sm font-medium"
        >
          <KeyRound className="size-4" /> Papermark API token
        </Label>
        <p id="pm-api-token-hint" className="mt-1 text-xs text-muted-foreground">
          In Papermark, go to Settings &rarr; API Tokens and create a token with
          read access. It is used to read your documents, datarooms, links and
          their settings.
        </p>
        <Input
          id="pm-api-token"
          className="mt-3 font-mono text-sm"
          placeholder="pm_live_..."
          value={apiToken}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error?.field === "apiToken"}
          aria-describedby={
            error?.field === "apiToken"
              ? "pm-api-token-error"
              : "pm-api-token-hint"
          }
          onChange={(e) => setApiToken(e.target.value)}
        />
        {error?.field === "apiToken" && (
          <p
            id="pm-api-token-error"
            role="alert"
            className="mt-2 text-xs text-destructive"
          >
            {error.message}
          </p>
        )}
        <a
          href="https://www.papermark.com/docs/api/getting-started"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Papermark API docs <ExternalLink className="size-3" />
        </a>
      </section>

      <section className="rounded-lg border bg-card p-5 shadow-[var(--shadow-hairline)]">
        <Label
          htmlFor="pm-cookie"
          className="flex items-center gap-1.5 text-sm font-medium"
        >
          <ShieldCheck className="size-4" /> Session cookie
          <span className="font-normal text-muted-foreground">- optional</span>
        </Label>
        <p id="pm-cookie-hint" className="mt-1 text-xs text-muted-foreground">
          Papermark&rsquo;s API deliberately serves no file contents, only
          metadata. With a session cookie Foyer can pull the original files
          across for you automatically. Without one, everything else still
          imports and you supply the files yourself at the end.
        </p>

        <Input
          id="pm-cookie"
          className="mt-3 font-mono text-sm"
          placeholder="__Secure-next-auth.session-token=..."
          value={cookie}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error?.field === "sessionCookie"}
          aria-describedby={
            error?.field === "sessionCookie"
              ? "pm-cookie-error"
              : "pm-cookie-hint"
          }
          onChange={(e) => setCookie(e.target.value)}
        />
        {error?.field === "sessionCookie" && (
          <p
            id="pm-cookie-error"
            role="alert"
            className="mt-2 text-xs text-destructive"
          >
            {error.message}
          </p>
        )}

        <Collapsible className="mt-3">
          <CollapsibleTrigger className="group focus-ring flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ChevronDown className="size-3 transition-transform duration-[var(--dur)] ease-[var(--ease-out-quint)] group-data-open:rotate-180" />
            How do I find this?
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden duration-[var(--dur)] ease-[var(--ease-out-quint)] data-closed:animate-collapsible-up data-open:animate-collapsible-down">
            <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <ol className="list-decimal space-y-1 pl-4">
              <li>Open Papermark in your browser and sign in.</li>
              <li>
                Open developer tools, then Application (Chrome) or Storage
                (Firefox) &rarr; Cookies.
              </li>
              <li>
                Copy the value of{" "}
                <code className="font-mono">
                  __Secure-next-auth.session-token
                </code>
                .
              </li>
            </ol>
            <p className="mt-2">
              It is encrypted at rest, never shown again, and deleted the moment
              the import finishes. It grants access to your own Papermark
              account, so treat it like a password and sign out of Papermark
              afterwards to invalidate it.
            </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </section>

      {error && !error.field && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={busy || !apiToken.trim()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Checking…" : "Connect"}
          {!busy && <ArrowRight className="size-4" />}
        </Button>
        <p className="text-xs text-muted-foreground">
          Nothing is imported yet. You will see exactly what will happen before
          anything is created.
        </p>
      </div>
    </div>
  );
}
