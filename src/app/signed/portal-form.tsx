"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
      <p className="mt-4 rounded-md bg-primary/10 p-3 text-sm text-primary">
        Check your inbox - if any documents were signed with that address, the
        link will open them.
      </p>
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
        autoFocus
      />
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        Send link
      </Button>
    </form>
  );
}

export function DifferentEmailButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-xs text-muted-foreground underline hover:text-foreground"
      onClick={async () => {
        await switchPortalEmail();
        router.refresh();
      }}
    >
      Use a different email
    </button>
  );
}
