"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/shell/copy-button";
import { EmptyState } from "@/components/shell/empty-state";
import { timeAgo } from "@/lib/format";
import { createApiToken, revokeApiToken } from "../actions";

export function TokensClient({
  mcpUrl,
  tokens,
}: {
  mcpUrl: string;
  tokens: {
    id: string;
    name: string;
    partialKey: string;
    createdBy: string;
    lastUsedAt: string | null;
    createdAt: string;
  }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="max-w-2xl space-y-8">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Connect over MCP</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Claude and other MCP clients can manage documents, links and
          analytics. Point the client at the endpoint below with an API key as
          the Bearer token.
        </p>
        <div className="mt-3 flex items-center gap-1 rounded-md bg-muted/60 px-3 py-2">
          <code className="flex-1 truncate font-mono text-xs">{mcpUrl}</code>
          <CopyButton value={mcpUrl} />
        </div>
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`{
  "mcpServers": {
    "foyer": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer <your api key>" }
    }
  }
}`}
        </pre>
      </section>

      <section className="space-y-3">
        <form
          className="flex gap-2"
          action={async () => {
            setBusy(true);
            try {
              const res = await createApiToken(name);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              if ("key" in res && res.key) setFreshKey(res.key);
              setName("");
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name, e.g. claude-desktop"
            className="flex-1"
            required
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            <Plus className="size-4" /> Create key
          </Button>
        </form>

        {freshKey && (
          <div className="rounded-lg border border-primary/40 bg-accent p-4">
            <p className="text-sm font-medium">
              Copy your key now, it will not be shown again
            </p>
            <div className="mt-2 flex items-center gap-1 rounded-md bg-white px-3 py-2">
              <code className="flex-1 truncate font-mono text-xs">
                {freshKey}
              </code>
              <CopyButton value={freshKey} />
            </div>
          </div>
        )}

        {tokens.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            description="Keys authenticate the REST API, the MCP endpoint and CLI tools."
          />
        ) : (
          <div className="space-y-1.5">
            {tokens.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <KeyRound className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {t.partialKey} · created by {t.createdBy}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t.lastUsedAt
                    ? `used ${timeAgo(t.lastUsedAt)}`
                    : "never used"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await revokeApiToken(t.id);
                    toast.success("Key revoked");
                    router.refresh();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
