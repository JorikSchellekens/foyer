"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MailPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { inviteRecipients, revokeRecipient } from "@/app/(app)/links/actions";

export type RecipientRow = {
  id: string;
  email: string;
  expiresAt: string | null;
  invitedAt: string;
};

export function InviteRecipientsDialog({
  linkId,
  linkName,
  recipients,
  open,
  onOpenChange,
}: {
  linkId: string;
  linkName: string;
  recipients: RecipientRow[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [emails, setEmails] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [sending, setSending] = useState(false);
  const router = useRouter();

  const parsed = emails
    .split(/[\n,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const invalid = parsed.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const canSend = parsed.length > 0 && invalid.length === 0;

  async function send() {
    setSending(true);
    try {
      const res = await inviteRecipients(
        linkId,
        emails.split(/[\n,;]+/),
        expiry === "never" ? null : Number(expiry)
      );
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Sent ${res.sent} invitation${res.sent === 1 ? "" : "s"}`);
      setEmails("");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        // Typed addresses are worth protecting from a stray click on the
        // backdrop. Escape still closes.
        onInteractOutside={(e) => {
          if (emails.trim()) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Invite by email</DialogTitle>
          <DialogDescription>
            Each person gets a personal access link to “{linkName}”. Personal
            links can expire independently of the main link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-emails">Email addresses</Label>
            <Textarea
              id="invite-emails"
              rows={3}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              onKeyDown={(e) => {
                // A textarea needs its Enter key, so send on the modifier.
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSend) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={"jane@fund.com\nmark@partners.vc"}
              autoFocus
              spellCheck={false}
              aria-invalid={invalid.length > 0}
              aria-describedby="invite-emails-note"
            />
            <p
              id="invite-emails-note"
              role={invalid.length > 0 ? "alert" : undefined}
              className={
                invalid.length > 0
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {invalid.length > 0
                ? `Check ${invalid.slice(0, 2).join(", ")}${invalid.length > 2 ? " and others" : ""}: that does not look like an email address.`
                : parsed.length > 0
                  ? `${parsed.length} recipient${parsed.length === 1 ? "" : "s"}. One per line, or separated by commas.`
                  : "One per line, or separated by commas."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-expiry">Personal link expires</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger id="invite-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="1">After 1 day</SelectItem>
                <SelectItem value="7">After 7 days</SelectItem>
                <SelectItem value="30">After 30 days</SelectItem>
                <SelectItem value="90">After 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {recipients.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm leading-none font-medium">
                Already invited
              </p>
              <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
                {recipients.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm transition-colors duration-[var(--dur-fast)] hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1 truncate">{r.email}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.expiresAt
                        ? `expires ${formatDate(r.expiresAt)}`
                        : "no expiry"}
                    </span>
                    <button
                      type="button"
                      aria-label={`Revoke access for ${r.email}`}
                      className="focus-ring rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                      onClick={async () => {
                        await revokeRecipient(r.id);
                        toast.success(`Revoked ${r.email}`);
                        router.refresh();
                      }}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Close
          </Button>
          <Button disabled={sending || !canSend} onClick={send}>
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MailPlus className="size-4" />
            )}
            {sending
              ? "Sending…"
              : parsed.length > 1
                ? `Send ${parsed.length} invitations`
                : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
