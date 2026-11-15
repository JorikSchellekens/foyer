"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  History,
  KeyRound,
  Loader2,
  Plug,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXPIRY_CHOICES,
  SCOPE_PRESETS,
  presetFor,
  type ScopePreset,
} from "@/lib/api-scopes";
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
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

type ApiEvent = {
  id: string;
  tokenName: string;
  partialKey: string | null;
  person: string | null;
  tool: string;
  summary: string;
  ok: boolean;
  createdAt: string;
};

/** "Organise and share", or the raw scopes for a combination with no name. */
function accessLabel(scopes: string[]) {
  return presetFor(scopes)?.label ?? (scopes.join(", ") || "No access");
}

function expiryLabel(expiresAt: string | null) {
  if (!expiresAt) return null;
  const at = new Date(expiresAt);
  const day = at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return at.getTime() <= Date.now() ? `expired ${day}` : `expires ${day}`;
}

function claudeCommand(mcpUrl: string, key: string) {
  return `claude mcp add --transport http foyer ${mcpUrl} --header "Authorization: Bearer ${key}"`;
}

export function TokensClient({
  mcpUrl,
  seesAll,
  tokens,
  events,
}: {
  mcpUrl: string;
  seesAll: boolean;
  tokens: Token[];
  events: ApiEvent[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<ScopePreset["id"]>("organise");
  const [expiry, setExpiry] = useState<string>("90");
  const [fresh, setFresh] = useState<{ key: string; access: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<Token | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="API and MCP"
        description="Keys authenticate the REST API, the MCP endpoint and CLI tools. A key acts as the person who created it, never with more than they can do themselves and only with the access chosen for it. It stops working if that person leaves the workspace, and can be revoked on its own."
      />

      <SettingsSection
        title="Connect over MCP"
        icon={Plug}
        description="Claude and other AI assistants can read the workspace, add documents and structure data rooms. Create a key below, then point the assistant at this endpoint with the key as the Bearer token."
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
          className="space-y-4"
          action={async () => {
            setBusy(true);
            try {
              const res = await createApiToken(
                name,
                preset,
                expiry === "never" ? null : Number(expiry)
              );
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              if ("key" in res && res.key)
                setFresh({
                  key: res.key,
                  access:
                    SCOPE_PRESETS.find((p) => p.id === preset)?.label ?? "",
                });
              setName("");
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude on my laptop"
              required
              maxLength={80}
              autoComplete="off"
              aria-describedby="token-name-help"
            />
            <p id="token-name-help" className="text-xs text-muted-foreground">
              Name it after where it will be used, so you know which one to
              revoke.
            </p>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">What it can do</legend>
            <RadioGroup
              value={preset}
              onValueChange={(v) => setPreset(v as ScopePreset["id"])}
              className="gap-0 divide-y rounded-md border"
            >
              {SCOPE_PRESETS.map((p) => (
                <label
                  key={p.id}
                  htmlFor={`scope-${p.id}`}
                  className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors duration-[var(--dur-fast)] hover:bg-muted/50 has-[[data-checked]]:bg-muted/50"
                >
                  <RadioGroupItem
                    id={`scope-${p.id}`}
                    value={p.id}
                    className="mt-0.5"
                    aria-labelledby={`scope-${p.id}-label`}
                    aria-describedby={`scope-${p.id}-help`}
                  />
                  <span className="min-w-0">
                    <span
                      id={`scope-${p.id}-label`}
                      className="block text-sm font-medium"
                    >
                      {p.label}
                    </span>
                    <span
                      id={`scope-${p.id}-help`}
                      className="block text-xs text-muted-foreground"
                    >
                      {p.description}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <Label htmlFor="token-expiry">Expires after</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id="token-expiry" className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_CHOICES.map((c) => (
                    <SelectItem
                      key={c.label}
                      value={c.days === null ? "never" : String(c.days)}
                    >
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {busy ? "Creating…" : "Create key"}
            </Button>
          </div>
        </form>

        {fresh && (
          <div
            // status, not alert: an alert would read the whole key aloud
            role="status"
            className="reveal-up mt-4 rounded-lg border border-[#b7791f]/50 bg-[#b7791f]/8 p-4"
          >
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="size-3.5 text-[#b7791f]" />
              Copy this key now. It is never shown again.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Access: {fresh.access}. Treat it like a password: if it leaks,
              revoke it here.
            </p>
            <div className="mt-3 flex items-center gap-1 rounded-md border bg-card px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs select-all">
                {fresh.key}
              </code>
              <CopyButton value={fresh.key} label="Copy key" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              To connect Claude Code, run this in a terminal:
            </p>
            <div className="mt-1.5 flex items-center gap-1 rounded-md border bg-card px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">
                {claudeCommand(mcpUrl, fresh.key)}
              </code>
              <CopyButton
                value={claudeCommand(mcpUrl, fresh.key)}
                label="Copy command"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setFresh(null)}
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
                    <p className="truncate text-xs text-muted-foreground">
                      {accessLabel(t.scopes)}
                      {expiryLabel(t.expiresAt) && (
                        <span suppressHydrationWarning>
                          {" · "}
                          {expiryLabel(t.expiresAt)}
                        </span>
                      )}
                    </p>
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

      <SettingsSection
        title="Recent changes made with keys"
        icon={History}
        description={`Everything added, moved, shared or deleted through the API or by an AI assistant${seesAll ? "" : " with your keys"}, newest first. Reading is not listed.`}
      >
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Changes made with a key are listed here.
          </p>
        ) : (
          <ul className="divide-y">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm break-words ${
                      e.ok ? "" : "text-muted-foreground"
                    }`}
                  >
                    {!e.ok && (
                      <span className="mr-1.5 rounded border px-1 py-px text-[10px] font-medium tracking-wide uppercase">
                        Not done
                      </span>
                    )}
                    {e.summary}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.tokenName}
                    {e.partialKey && (
                      <span className="font-mono"> · {e.partialKey}</span>
                    )}
                    {e.person && ` · ${e.person}`}
                    <span className="font-mono"> · {e.tool}</span>
                  </p>
                </div>
                <time
                  dateTime={e.createdAt}
                  title={new Date(e.createdAt).toLocaleString()}
                  className="shrink-0 text-xs text-muted-foreground"
                  suppressHydrationWarning
                >
                  {timeAgo(e.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
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
                try {
                  const res = await revokeApiToken(id);
                  if (res && "error" in res && res.error) toast.error(res.error);
                  else toast.success("Key revoked");
                } catch {
                  toast.error("The key could not be revoked. Try again.");
                }
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
