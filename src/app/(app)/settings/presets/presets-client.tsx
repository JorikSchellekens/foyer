"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, SlidersHorizontal, Star, Trash2 } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shell/empty-state";
import type { LinkConfig } from "@/lib/link-config";
import { SettingsIntro } from "../section";
import { savePreset, deletePreset } from "../actions";

type Preset = {
  id: string;
  name: string;
  isDefault: boolean;
  config: Partial<LinkConfig>;
};

export function PresetsClient({ presets }: { presets: Preset[] }) {
  const [editing, setEditing] = useState<Preset | null | "new">(null);
  const [deleting, setDeleting] = useState<Preset | null>(null);
  const router = useRouter();

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="Link presets"
        description="Presets pre-fill link settings so every share starts from your standards. The default preset applies automatically to new links."
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New preset
          </Button>
        }
      />

      {presets.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No presets yet"
          description="Try one like “Investor default”: verified email, downloads off, watermark on."
        />
      ) : (
        <div className="space-y-1.5">
          {presets.map((p, i) => (
            <div
              key={p.id}
              className="stagger-item hover-raise flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-[var(--shadow-hairline)] hover:border-input"
              style={{ "--i": i } as React.CSSProperties}
            >
              <button
                className="focus-ring min-w-0 flex-1 rounded-sm text-left"
                onClick={() => setEditing(p)}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="underline-grow truncate">{p.name}</span>
                  {p.isDefault && (
                    <Star
                      className="size-3.5 shrink-0 fill-[#b7791f] text-[#b7791f]"
                      aria-label="Default preset"
                    />
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {describeConfig(p.config)}
                </span>
              </button>
              {p.isDefault && <Badge variant="secondary">default</Badge>}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete preset ${p.name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleting(p)}
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

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Links already created from this preset keep their settings. Only
              the starting point for new links goes away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep preset</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                const id = deleting?.id;
                setDeleting(null);
                if (!id) return;
                await deletePreset(id);
                toast.success("Preset deleted");
                router.refresh();
              }}
            >
              Delete preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

const TOGGLES = [
  ["allowDownload", "Allow downloads"],
  ["screenshotProtection", "Screenshot deterrence"],
  ["watermark", "Dynamic watermark"],
  ["notifyOnAccess", "Notify on access"],
] as const;

function PresetEditor({
  preset,
  onClose,
}: {
  preset: Preset | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(preset?.name ?? "");
  const [isDefault, setIsDefault] = useState(preset?.isDefault ?? false);
  const [config, setConfig] = useState<Partial<LinkConfig>>(
    preset?.config ?? { accessMode: "EMAIL", allowDownload: true }
  );
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof LinkConfig>(k: K, v: LinkConfig[K]) =>
    setConfig((c) => ({ ...c, [k]: v }));
  const dirty = name !== (preset?.name ?? "");

  async function save() {
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
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (dirty) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{preset ? "Edit preset" : "New preset"}</DialogTitle>
          <DialogDescription>
            These settings pre-fill the link editor; everything stays
            adjustable per link.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!saving && name.trim()) void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-name`}>Preset name</Label>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Investor default"
              aria-invalid={!name.trim()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-access`}>Identity verification</Label>
            <Select
              value={config.accessMode ?? "PUBLIC"}
              onValueChange={(v) =>
                set("accessMode", v as LinkConfig["accessMode"])
              }
            >
              <SelectTrigger id={`${uid}-access`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">No email</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="EMAIL_VERIFIED">Verified email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="divide-y">
            {TOGGLES.map(([key, label]) => (
              <div key={key} className="flex items-center gap-3 py-2">
                <label
                  htmlFor={`${uid}-${key}`}
                  className="cursor-pointer text-sm select-none"
                >
                  {label}
                </label>
                <span
                  aria-hidden
                  className="leader-dots text-muted-foreground/70"
                />
                <Switch
                  id={`${uid}-${key}`}
                  checked={
                    (config[key] as boolean | undefined) ??
                    (key === "allowDownload" || key === "notifyOnAccess")
                  }
                  onCheckedChange={(v) => set(key, v)}
                />
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 border-t pt-4">
            <div className="min-w-0 flex-1">
              <label
                htmlFor={`${uid}-default`}
                className="cursor-pointer text-sm font-medium select-none"
              >
                Default preset
              </label>
              <p
                id={`${uid}-default-hint`}
                className="text-xs text-muted-foreground"
              >
                Applied automatically when creating new links.
              </p>
            </div>
            <Switch
              id={`${uid}-default`}
              aria-describedby={`${uid}-default-hint`}
              checked={isDefault}
              onCheckedChange={setIsDefault}
              className="mt-1"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Saving…" : preset ? "Save changes" : "Create preset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
