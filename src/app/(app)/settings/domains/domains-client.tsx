"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, Cloud, Globe, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { addDomain, verifyDomain, deleteDomain } from "../actions";
import { timeAgo } from "@/lib/format";

export function DomainsClient({
  appHost,
  hasGlobalCfToken,
  domains,
}: {
  appHost: string;
  hasGlobalCfToken: boolean;
  domains: {
    id: string;
    domain: string;
    status: "PENDING" | "VERIFIED" | "ERROR";
    autoConfigured: boolean;
    lastCheckedAt: string | null;
  }[];
}) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [busy, setBusy] = useState(false);
  const target = appHost.split(":")[0];

  return (
    <div className="max-w-2xl space-y-8">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Globe className="size-4" /> Add a custom domain
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Links can then live on your own domain, like
          dataroom.yourcompany.com/deck.
        </p>
        <form
          className="mt-3 space-y-3"
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
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="dataroom.yourcompany.com"
            required
          />
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Cloud className="size-3.5" />
              Auto-configure with Cloudflare
              {hasGlobalCfToken && (
                <Badge variant="secondary" className="ml-1">
                  server token available
                </Badge>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Label className="text-xs">
                Cloudflare API token (Zone → DNS → Edit)
              </Label>
              <Input
                value={cfToken}
                onChange={(e) => setCfToken(e.target.value)}
                placeholder={
                  hasGlobalCfToken
                    ? "Leave blank to use the server's token"
                    : "cf_..."
                }
                className="mt-1 font-mono text-xs"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                We find the zone for your domain and create a proxied CNAME →{" "}
                <span className="font-mono">{target}</span> automatically.
                Cloudflare then issues the certificate at its edge. Without a
                token, create the CNAME yourself.
              </p>
            </CollapsibleContent>
          </Collapsible>
          <Button type="submit" disabled={busy || !domain.trim()}>
            {busy ? "Adding…" : "Add domain"}
          </Button>
        </form>
      </section>

      <section className="space-y-1.5">
        {domains.map((d) => (
          <div
            key={d.id}
            className="rounded-lg border bg-card px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="flex-1 truncate font-mono text-sm">
                {d.domain}
              </span>
              {d.status === "VERIFIED" ? (
                <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10">
                  <BadgeCheck className="size-3" /> verified
                </Badge>
              ) : (
                <Badge variant="secondary">pending DNS</Badge>
              )}
              {d.autoConfigured && (
                <Badge variant="outline" className="gap-1">
                  <Cloud className="size-3" /> cloudflare
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Check verification"
                onClick={async () => {
                  const res = await verifyDomain(d.id);
                  if (res && "error" in res && res.error)
                    toast.warning(res.error);
                  else toast.success(`${d.domain} is verified and live`);
                  router.refresh();
                }}
              >
                <RefreshCw className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                title="Remove domain"
                onClick={async () => {
                  await deleteDomain(d.id);
                  toast.success("Domain removed");
                  router.refresh();
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            {d.status !== "VERIFIED" && (
              <div className="mt-2 rounded-md bg-muted/60 px-3 py-2 font-mono text-xs text-muted-foreground">
                CNAME&nbsp;&nbsp;{d.domain}&nbsp;&nbsp;→&nbsp;&nbsp;{target}
              </div>
            )}
            {d.lastCheckedAt && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                last checked {timeAgo(d.lastCheckedAt)}
              </p>
            )}
          </div>
        ))}
        {domains.length === 0 && (
          <p className="rounded-lg border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            No custom domains yet. Links use {appHost} until you add one.
          </p>
        )}
      </section>
    </div>
  );
}
