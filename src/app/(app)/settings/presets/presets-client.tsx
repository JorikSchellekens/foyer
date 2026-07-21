"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, SlidersHorizontal, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shell/empty-state";
import type { LinkConfig } from "@/lib/link-config";
import { savePreset, deletePreset } from "../actions";

type Preset = {
  id: string;
  name: string;
  isDefault: boolean;
  config: Partial<LinkConfig>;
};

export function PresetsClient({ presets }: { presets: Preset[] }) {
  const [editing, setEditing] = useState<Preset | null | "new">(null);
  const router = useRouter();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Presets pre-fill link settings so every share starts from your
          standards. The default preset applies automatically to new links.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New preset
        </Button>
      </div>

      {presets.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No presets yet"
          description="Try one like “Investor default”: verified email, downloads off, watermark on."
        />
      ) : (
        <div className="space-y-1.5">
          {presets.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setEditing(p)}
              >
                <p className="flex items-center gap-1.5 text-sm font-medium hover:underline">
                  {p.name}
                  {p.isDefault && (
                    <Star className="size-3.5 fill-[#b7791f] text-[#b7791f]" />
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {describeConfig(p.config)}
                </p>
              </button>
              {p.isDefault && <Badge variant="secondary">default</Badge>}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  await deletePreset(p.id);
                  toast.success("Preset deleted");
                  router.refresh();
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <PresetEditor
          preset={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function describeConfig(c: Partial<LinkConfig>): string {
  const bits: string[] = [];
  if (c.accessMode === "EMAIL_VERIFIED") bits.push("verified email");
  else if (c.accessMode === "EMAIL") bits.push("email required");
  else bits.push("public");
  if (c.allowDownload === false) bits.push("no downloads");
  if (c.watermark) bits.push("watermark");
  if (c.screenshotProtection) bits.push("screenshot deterrence");
  if (c.agreementId) bits.push("NDA");
  return bits.join(" · ");
}

function PresetEditor({
  preset,
  onClose,
}: {
  preset: Preset | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(preset?.name ?? "");
  const [isDefault, setIsDefault] = useState(preset?.isDefault ?? false);
  const [config, setConfig] = useState<Partial<LinkConfig>>(
    preset?.config ?? { accessMode: "EMAIL", allowDownload: true }
  );
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof LinkConfig>(k: K, v: LinkConfig[K]) =>
    setConfig((c) => ({ ...c, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{preset ? "Edit preset" : "New preset"}</DialogTitle>
          <DialogDescription>
            These settings pre-fill the link editor; everything stays
            adjustable per link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Preset name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Investor default"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Identity verification</Label>
            <Select
              value={config.accessMode ?? "PUBLIC"}
              onValueChange={(v) =>
                set("accessMode", v as LinkConfig["accessMode"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">No email</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="EMAIL_VERIFIED">Verified email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(
            [
              ["allowDownload", "Allow downloads"],
              ["screenshotProtection", "Screenshot deterrence"],
              ["watermark", "Dynamic watermark"],
              ["notifyOnAccess", "Notify on access"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <Switch
                checked={
                  (config[key] as boolean | undefined) ??
                  (key === "allowDownload" || key === "notifyOnAccess")
                }
                onCheckedChange={(v) => set(key, v)}
              />
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <span className="text-sm font-medium">Default preset</span>
              <p className="text-xs text-muted-foreground">
                Applied automatically when creating new links.
              </p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await savePreset({
                  id: preset?.id,
                  name,
                  isDefault,
                  config: config as Record<string, unknown>,
                });
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success(preset ? "Preset updated" : "Preset created");
                onClose();
                router.refresh();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : preset ? "Save changes" : "Create preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
