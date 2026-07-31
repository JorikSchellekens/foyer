"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  Plug,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { timeAgo } from "@/lib/format";
import { SettingsIntro, SettingsSection } from "../section";
import { createApiToken, revokeApiToken } from "../actions";

type Token = {
  id: string;
  name: string;
  partialKey: string;
  createdBy: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export function TokensClient({
  mcpUrl,
  tokens,
}: {
  mcpUrl: string;
  tokens: Token[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<Token | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="API and MCP"
        description="Keys authenticate the REST API, the MCP endpoint and CLI tools. Each key belongs to the person who created it and can be revoked on its own."
      />

      <SettingsSection
        title="Connect over MCP"
        icon={Plug}
        description="Claude and other MCP clients can manage documents, links and analytics. Point the client at the endpoint below with an API key as the Bearer token."
      >
        <div className="flex items-center gap-1 rounded-md border bg-muted/50 px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">
            {mcpUrl}
          </code>
          <CopyButton value={mcpUrl} label="Copy" />
        </div>
        <div className="relative mt-2">
          <pre className="overflow-x-auto rounded-md border bg-muted/50 px-3 py-2.5 pr-10 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`{
  "mcpServers": {
    "foyer": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer <your api key>" }
    }
  }
}`}
          </pre>
          <span className="absolute top-1.5 right-1.5">
            <CopyButton
              value={`{\n  "mcpServers": {\n    "foyer": {\n      "url": "${mcpUrl}",\n      "headers": { "Authorization": "Bearer <your api key>" }\n    }\n  }\n}`}
            />
          </span>
        </div>
      </SettingsSection>

      <SettingsSection
        title="API keys"
        icon={KeyRound}
        description="A key is shown once, at the moment it is created. Store it in your password manager before leaving this page."
      >
        <form
          className="flex flex-col gap-2 sm:flex-row"
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
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="token-name" className="sr-only">
              Key name
            </Label>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Key name, e.g. claude-desktop"
              required
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {busy ? "Creating…" : "Create key"}
          </Button>
        </form>

        {freshKey && (
          <div
            role="alert"
            className="reveal-up mt-4 rounded-lg border border-[#b7791f]/50 bg-[#b7791f]/8 p-4"
          >
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="size-3.5 text-[#b7791f]" />
              Copy this key now. It is never shown again.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              It grants full API access to this workspace. Treat it like a
              password: if it leaks, revoke it here.
            </p>
            <div className="mt-3 flex items-center gap-1 rounded-md border bg-card px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs select-all">
                {freshKey}
              </code>
              <CopyButton value={freshKey} label="Copy key" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setFreshKey(null)}
            >
              I have stored it
            </Button>
          </div>
        )}

        <div className="mt-4">
          {tokens.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No API keys yet"
              description="Keys authenticate the REST API, the MCP endpoint and CLI tools."
            />
          ) : (
            <ul className="divide-y">
              {tokens.map((t, i) => (
                <li
                  key={t.id}
                  className="stagger-item flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <KeyRound
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {t.partialKey} · {t.createdBy}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                    {t.lastUsedAt
                      ? `used ${timeAgo(t.lastUsedAt)}`
                      : "never used"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Revoke ${t.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setRevoking(t)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsSection>

      <AlertDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoking?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using{" "}
              <span className="font-mono">{revoking?.partialKey}</span> stops
              working immediately. This cannot be undone: you would have to
              create a new key and update every client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep key</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                const id = revoking?.id;
                setRevoking(null);
                if (!id) return;
                await revokeApiToken(id);
                toast.success("Key revoked");
                router.refresh();
              }}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
