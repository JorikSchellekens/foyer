"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  requestPortalLink,
  switchPortalEmail,
  forgetPortalDetails,
} from "./actions";

export function PortalEmailForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent)
    return (
      <div className="reveal-up mt-4 flex items-start gap-3 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm text-primary">
        <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="leading-relaxed">
          Check your inbox - if any documents were signed with that address, the
          link will open them.
        </p>
      </div>
    );

  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await requestPortalLink(email);
        setBusy(false);
        if (res && "error" in res) toast.error(res.error);
        else setSent(true);
      }}
    >
      <Input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        aria-label="Email address"
        autoComplete="email"
        inputMode="email"
        autoFocus
      />
      <Button type="submit" disabled={busy} className="shrink-0">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {busy ? "Sending" : "Send link"}
      </Button>
    </form>
  );
}

export function DifferentEmailButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="focus-ring underline-grow rounded text-xs text-muted-foreground transition-colors hover:text-foreground"
      onClick={async () => {
        await switchPortalEmail();
        router.refresh();
      }}
    >
      Use a different email
    </button>
  );
}

/**
 * What we hold about the signer beyond their envelopes, and the one control
 * that matters: removing it. Rendered only when a profile exists.
 */
export function SavedDetailsCard({
  name,
  signatureData,
  initialsData,
  consentedAt,
}: {
  name: string | null;
  signatureData: string | null;
  initialsData: string | null;
  consentedAt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <section
      data-testid="portal-saved-details"
      className="mt-8 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Saved signing details</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Kept at your request on {consentedAt} so you do not have to enter
            them again. Only you can see them, and only after opening a link
            sent to this email.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          data-testid="portal-forget-details"
          onClick={async () => {
            setBusy(true);
            const res = await forgetPortalDetails();
            setBusy(false);
            if (res && "error" in res) {
              toast.error(res.error);
              return;
            }
            toast.success("Your saved details have been removed.");
            router.refresh();
          }}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="size-3.5" aria-hidden />
          )}
          Remove
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd className="truncate">{name ?? "—"}</dd>
        <dt className="text-muted-foreground">Signature</dt>
        <dd>
          {signatureData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signatureData}
              alt="Your saved signature"
              className="h-10 max-w-48 rounded border bg-white object-contain px-2"
            />
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-muted-foreground">Initials</dt>
        <dd>
          {initialsData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={initialsData}
              alt="Your saved initials"
              className="h-8 max-w-24 rounded border bg-white object-contain px-2"
            />
          ) : (
            "—"
          )}
        </dd>
      </dl>
    </section>
  );
}
