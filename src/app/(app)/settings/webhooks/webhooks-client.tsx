"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CopyButton } from "@/components/shell/copy-button";
import { EmptyState } from "@/components/shell/empty-state";
import { timeAgo } from "@/lib/format";
import { saveWebhook, deleteWebhook } from "../actions";

const EVENTS = [
  "document.viewed",
  "dataroom.visited",
  "link.created",
  "new.question",
  "blocked.access",
];

export function WebhooksClient({
  hooks,
}: {
  hooks: {
    id: string;
    url: string;
    secret: string;
    events: string[];
    active: boolean;
    deliveries: {
      id: string;
      event: string;
      statusCode: number | null;
      error: string | null;
      createdAt: string;
    }[];
  }[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  return (
    <div className="max-w-2xl space-y-8">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Add a webhook</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          POSTed as JSON with an HMAC-SHA256 signature in{" "}
          <code className="font-mono">x-foyer-signature</code>. Leave events
          empty to receive everything.
        </p>
        <form
          className="mt-3 space-y-3"
          action={async () => {
            setBusy(true);
            try {
              const res = await saveWebhook({ url, events, active: true });
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Webhook added");
              setUrl("");
              setEvents([]);
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourapp.com/webhooks/foyer"
            required
          />
          <div className="flex flex-wrap gap-3">
            {EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={events.includes(ev)}
                  onCheckedChange={(v) =>
                    setEvents((s) =>
                      v === true ? [...s, ev] : s.filter((x) => x !== ev)
                    )
                  }
                />
                <span className="font-mono">{ev}</span>
              </label>
            ))}
          </div>
          <Button type="submit" disabled={busy || !url.trim()}>
            <Plus className="size-4" /> Add webhook
          </Button>
        </form>
      </section>

      {hooks.length === 0 ? (
        <EmptyState
          icon={WebhookIcon}
          title="No webhooks yet"
          description="Push view events into Slack, your CRM, or anywhere else the moment they happen."
        />
      ) : (
        <div className="space-y-1.5">
          {hooks.map((h) => (
            <div key={h.id} className="rounded-lg border bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                <WebhookIcon className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {h.url}
                </span>
                {!h.active && <Badge variant="secondary">paused</Badge>}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await deleteWebhook(h.id);
                    toast.success("Webhook deleted");
                    router.refresh();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {h.events.length === 0
                    ? "all events"
                    : h.events.join(", ")}
                </span>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  secret <code className="font-mono">{h.secret.slice(0, 8)}…</code>
                  <CopyButton value={h.secret} />
                </span>
              </div>
              {h.deliveries.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline">
                    Recent deliveries
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-1">
                      {h.deliveries.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
                        >
                          <span
                            className={
                              d.statusCode && d.statusCode < 300
                                ? "text-primary"
                                : "text-destructive"
                            }
                          >
                            {d.statusCode ?? "ERR"}
                          </span>
                          <span>{d.event}</span>
                          <span className="flex-1 truncate">
                            {d.error ?? ""}
                          </span>
                          <span>{timeAgo(d.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
