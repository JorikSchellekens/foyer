"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyButton } from "@/components/shell/copy-button";
import { EmptyState } from "@/components/shell/empty-state";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { SettingsIntro, SettingsSection } from "../section";
import { saveWebhook, deleteWebhook } from "../actions";

const EVENTS = [
  "document.viewed",
  "dataroom.visited",
  "link.created",
  "new.question",
  "blocked.access",
];

type Hook = {
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
};

export function WebhooksClient({ hooks }: { hooks: Hook[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Hook | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="Webhooks"
        description="Push view events into Slack, your CRM, or anywhere else the moment they happen."
      />

      <SettingsSection
        title="Add a webhook"
        icon={WebhookIcon}
        description={
          <>
            POSTed as JSON with an HMAC-SHA256 signature in{" "}
            <code className="font-mono">x-foyer-signature</code>. Leave events
            empty to receive everything.
          </>
        }
      >
        <form
          className="space-y-3"
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
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input
              id="webhook-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourapp.com/webhooks/foyer"
              className="font-mono text-xs"
              spellCheck={false}
              required
            />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm leading-none font-medium">Events</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
              {EVENTS.map((ev) => (
                <label
                  key={ev}
                  className="flex cursor-pointer items-center gap-1.5 text-xs"
                >
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
            <p className="text-xs text-muted-foreground">
              {events.length === 0
                ? "Nothing selected: every event will be delivered."
                : `${events.length} selected.`}
            </p>
          </fieldset>
          <Button type="submit" disabled={busy || !url.trim()}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {busy ? "Adding…" : "Add webhook"}
          </Button>
        </form>
      </SettingsSection>

      {hooks.length === 0 ? (
        <EmptyState
          icon={WebhookIcon}
          title="No webhooks yet"
          description="Push view events into Slack, your CRM, or anywhere else the moment they happen."
        />
      ) : (
        <div className="space-y-2">
          {hooks.map((h, i) => (
            <div
              key={h.id}
              className="stagger-item rounded-lg border bg-card px-4 py-3 shadow-[var(--shadow-hairline)]"
              style={{ "--i": i } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <WebhookIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {h.url}
                </span>
                {!h.active && <Badge variant="secondary">paused</Badge>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete webhook ${h.url}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(h)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">
                  {h.events.length === 0 ? "all events" : h.events.join(", ")}
                </span>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-0.5">
                  secret{" "}
                  <code className="font-mono">{h.secret.slice(0, 8)}…</code>
                  <CopyButton value={h.secret} />
                </span>
              </div>
              <DeliveryHistory deliveries={h.deliveries} />
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{deleting?.url}</span> stops receiving
              events immediately, and its delivery history is removed with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep webhook</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                const id = deleting?.id;
                setDeleting(null);
                if (!id) return;
                await deleteWebhook(id);
                toast.success("Webhook deleted");
                router.refresh();
              }}
            >
              Delete webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Health first, detail on demand: the collapsed trigger already says whether
 * the last few deliveries landed, so nobody has to open it to find out.
 */
function DeliveryHistory({
  deliveries,
}: {
  deliveries: Hook["deliveries"];
}) {
  if (deliveries.length === 0)
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        No deliveries attempted yet.
      </p>
    );

  const ok = (code: number | null) => !!code && code < 300;
  const failures = deliveries.filter((d) => !ok(d.statusCode)).length;

  return (
    <Collapsible className="mt-2">
      <CollapsibleTrigger className="group focus-ring flex w-full items-center gap-2 rounded-md py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronDown className="size-3 shrink-0 transition-transform duration-[var(--dur)] ease-[var(--ease-out-quint)] group-data-open:rotate-180" />
        Recent deliveries
        <span className="flex items-center gap-1" aria-hidden>
          {deliveries.map((d) => (
            <span
              key={d.id}
              className={cn(
                "h-2.5 w-1 rounded-full",
                ok(d.statusCode) ? "bg-primary/70" : "bg-destructive/70"
              )}
            />
          ))}
        </span>
        <span className="ml-auto tabular">
          {failures === 0
            ? `last ${deliveries.length} delivered`
            : `${failures} of ${deliveries.length} failed`}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden duration-[var(--dur)] ease-[var(--ease-out-quint)] data-closed:animate-collapsible-up data-open:animate-collapsible-down">
        <ul className="mt-2 divide-y rounded-md border bg-muted/30">
          {deliveries.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 px-2.5 py-1.5 font-mono text-xs"
            >
              <span
                className={cn(
                  "w-9 shrink-0 tabular",
                  ok(d.statusCode) ? "text-primary" : "text-destructive"
                )}
              >
                {d.statusCode ?? "ERR"}
              </span>
              <span className="shrink-0 text-muted-foreground">{d.event}</span>
              <span className="min-w-0 flex-1 truncate text-destructive">
                {d.error ?? ""}
              </span>
              <span className="shrink-0 text-muted-foreground tabular">
                {timeAgo(d.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
