"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPortalLink, switchPortalEmail } from "./actions";

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
