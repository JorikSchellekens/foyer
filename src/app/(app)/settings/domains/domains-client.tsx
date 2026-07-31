"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BadgeCheck,
  ChevronDown,
  Cloud,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { addDomain, verifyDomain, deleteDomain } from "../actions";
import { timeAgo } from "@/lib/format";
import { SettingsIntro, SettingsSection } from "../section";

type DomainRow = {
  id: string;
  domain: string;
  status: "PENDING" | "VERIFIED" | "ERROR";
  autoConfigured: boolean;
  lastCheckedAt: string | null;
};

export function DomainsClient({
  appHost,
  hasGlobalCfToken,
  domains,
}: {
  appHost: string;
  hasGlobalCfToken: boolean;
  domains: DomainRow[];
}) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<DomainRow | null>(null);
  const target = appHost.split(":")[0];

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="Custom domains"
        description={`Links live on ${appHost} until you add a domain of your own. Once a domain is live, every link can be issued on it.`}
      />

      <SettingsSection
        title="Add a custom domain"
        icon={Globe}
        description="Links can then live on your own domain, like dataroom.yourcompany.com/deck."
      >
        <form
          className="space-y-3"
          action={async () => {
            setBusy(true);
            try {
              const res = await addDomain(domain, cfToken || undefined);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              if (res.autoConfigured) {
                toast.success(
                  "DNS record created in Cloudflare. Verifying may take a minute."
                );
              } else if (res.autoError) {
                toast.warning(
                  `Domain added, but auto-configuration failed: ${res.autoError}`
                );
              } else {
                toast.success("Domain added. Now point DNS at us.");
              }
              setDomain("");
              setCfToken("");
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-domain">Domain</Label>
            <Input
              id="new-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="dataroom.yourcompany.com"
              className="font-mono"
              spellCheck={false}
              autoCapitalize="off"
              required
            />
          </div>
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="group focus-ring flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ChevronDown className="size-3 transition-transform duration-[var(--dur)] ease-[var(--ease-out-quint)] group-data-open:rotate-180" />
              <Cloud className="size-3.5" />
              Auto-configure with Cloudflare
              {hasGlobalCfToken && (
                <Badge variant="secondary" className="ml-1">
                  server token available
                </Badge>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden duration-[var(--dur)] ease-[var(--ease-out-quint)] data-closed:animate-collapsible-up data-open:animate-collapsible-down">
              <div className="pt-2.5">
                <Label htmlFor="cf-token" className="text-xs">
                  Cloudflare API token (Zone, DNS, Edit)
                </Label>
                <Input
                  id="cf-token"
                  value={cfToken}
                  onChange={(e) => setCfToken(e.target.value)}
                  placeholder={
                    hasGlobalCfToken
                      ? "Leave blank to use the server's token"
                      : "cf_..."
                  }
                  className="mt-1.5 font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  We find the zone for your domain and create a proxied CNAME to{" "}
                  <span className="font-mono">{target}</span> automatically.
                  Cloudflare then issues the certificate at its edge. Without a
                  token, create the CNAME yourself.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <Button type="submit" disabled={busy || !domain.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Adding…" : "Add domain"}
          </Button>
        </form>
      </SettingsSection>

      <section className="space-y-2">
        {domains.map((d, i) => (
          <DomainCard
            key={d.id}
            domain={d}
            target={target}
            index={i}
            onRemove={() => setRemoving(d)}
          />
        ))}
        {domains.length === 0 && (
          <p className="rounded-lg border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            No custom domains yet. Links use {appHost} until you add one.
          </p>
        )}
      </section>

      <AlertDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.domain}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Every link already issued on this domain stops resolving. Anything
              you have sent out on that address will 404 until the domain is
              added back and verified again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep domain</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                const id = removing?.id;
                setRemoving(null);
                if (!id) return;
                await deleteDomain(id);
                toast.success("Domain removed");
                router.refresh();
              }}
            >
              Remove domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * A domain has three states worth distinguishing: live, being checked right
 * now, and waiting on DNS. The DNS record only shows in the last two, where it
 * is the thing the user has to act on, and every part of it is copyable
 * separately because DNS panels ask for the fields one at a time.
 */
function DomainCard({
  domain: d,
  target,
  index,
  onRemove,
}: {
  domain: DomainRow;
  target: string;
  index: number;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const live = d.status === "VERIFIED";

  async function check() {
    setChecking(true);
    try {
      const res = await verifyDomain(d.id);
      if (res && "error" in res && res.error) toast.warning(res.error);
      else toast.success(`${d.domain} is verified and live`);
      router.refresh();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      className="stagger-item rounded-lg border bg-card px-4 py-3 shadow-[var(--shadow-hairline)]"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-mono text-sm">
          {d.domain}
        </span>
        <StatusBadge live={live} checking={checking} />
        {d.autoConfigured && (
          <Badge variant="outline" className="gap-1">
            <Cloud className="size-3" /> cloudflare
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Check verification for ${d.domain}`}
          disabled={checking}
          onClick={check}
        >
          <RefreshCw
            className={cn("size-3.5", checking && "animate-spin")}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${d.domain}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {!live && (
        <div className="mt-2.5 overflow-hidden rounded-md border bg-muted/40">
          <p className="border-b px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Add this record at your DNS provider
          </p>
          <dl className="divide-y">
            <DnsCell label="Type" value="CNAME" copyable={false} />
            <DnsCell label="Name" value={d.domain} />
            <DnsCell label="Value" value={target} />
          </dl>
        </div>
      )}
      {d.lastCheckedAt && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          last checked {timeAgo(d.lastCheckedAt)}
        </p>
      )}
    </div>
  );
}

function StatusBadge({
  live,
  checking,
}: {
  live: boolean;
  checking: boolean;
}) {
  if (checking)
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="size-3 animate-spin" /> verifying
      </Badge>
    );
  if (live)
    return (
      <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10">
        <BadgeCheck className="size-3" /> live
      </Badge>
    );
  return <Badge variant="secondary">pending DNS</Badge>;
}

function DnsCell({
  label,
  value,
  copyable = true,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <dt className="w-12 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 truncate font-mono text-xs">{value}</dd>
      {copyable && <CopyButton value={value} />}
    </div>
  );
}
