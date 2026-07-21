"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MailPlus, X } from "lucide-react";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
              placeholder={"jane@fund.com\nmark@partners.vc"}
            />
            <p className="text-xs text-muted-foreground">
              One per line, or separated by commas.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Personal link expires</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger>
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
              <Label>Already invited</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {recipients.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60"
                  >
                    <span className="flex-1 truncate">{r.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.expiresAt
                        ? `expires ${formatDate(r.expiresAt)}`
                        : "no expiry"}
                    </span>
                    <button
                      type="button"
                      title="Revoke access"
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        await revokeRecipient(r.id);
                        toast.success(`Revoked ${r.email}`);
                        router.refresh();
                      }}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={sending || !emails.trim()}
            onClick={async () => {
              setSending(true);
              try {
                const list = emails.split(/[\n,;]+/);
                const res = await inviteRecipients(
                  linkId,
                  list,
                  expiry === "never" ? null : Number(expiry)
                );
                if ("error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success(
                  `Sent ${res.sent} invitation${res.sent === 1 ? "" : "s"}`
                );
                setEmails("");
                router.refresh();
              } finally {
                setSending(false);
              }
            }}
          >
            <MailPlus className="size-4" />
            {sending ? "Sending…" : "Send invitations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
