"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GalleryHorizontalEnd, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/empty-state";
import { ImageField } from "@/components/branding/image-field";
import { pluralize } from "@/lib/format";
import { savePreviewPreset, deletePreviewPreset } from "./actions";

type Preset = {
  id: string;
  name: string;
  isDefault: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaImageKey: string | null;
  linkCount: number;
};

export function PreviewsClient({ presets }: { presets: Preset[] }) {
  const [editing, setEditing] = useState<Preset | null | "new">(null);
  const router = useRouter();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Preview presets define the social card shown when a link lands in
          Slack, iMessage or LinkedIn. Pick one per link, and mark one as the
          default for links without their own preview.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New preview
        </Button>
      </div>

      {presets.length === 0 ? (
        <EmptyState
          icon={GalleryHorizontalEnd}
          title="No preview presets yet"
          description="Create one per audience — a polished card for investors, a plain one for internal shares."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {presets.map((p) => (
            <div key={p.id} className="rounded-lg border bg-card">
              <button
                className="block w-full text-left"
                onClick={() => setEditing(p)}
              >
                <div className="flex h-28 items-center justify-center overflow-hidden rounded-t-lg border-b bg-muted/40">
                  {p.metaImageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/assets/${p.metaImageKey}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <GalleryHorizontalEnd className="size-6 text-muted-foreground/40" />
                  )}
                </div>
                <div className="p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {p.name}
                    {p.isDefault && (
                      <Star className="size-3.5 fill-[#b7791f] text-[#b7791f]" />
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.metaTitle ?? "No title set"}
                  </p>
                </div>
              </button>
              <div className="flex items-center justify-between border-t px-3 py-1.5">
                <span className="text-xs text-muted-foreground">
                  {pluralize(p.linkCount, "link")}
                  {p.isDefault ? " · default" : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await deletePreviewPreset(p.id);
                    toast.success("Preview deleted");
                    router.refresh();
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <PreviewEditor
          preset={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PreviewEditor({
  preset,
  onClose,
}: {
  preset: Preset | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(preset?.name ?? "");
  const [isDefault, setIsDefault] = useState(preset?.isDefault ?? false);
  const [metaTitle, setMetaTitle] = useState(preset?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(
    preset?.metaDescription ?? ""
  );
  const [metaImageKey, setMetaImageKey] = useState<string | null>(
    preset?.metaImageKey ?? null
  );
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {preset ? "Edit preview" : "New preview preset"}
          </DialogTitle>
          <DialogDescription>
            A link's own preview fields always win over the preset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Preset name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Investor card"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Preview title</Label>
            <Input
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Acme — Series A materials"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Preview description</Label>
            <Textarea
              rows={2}
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
            />
          </div>
          <ImageField
            label="Preview image"
            hint="Roughly 1200×630 works best."
            value={metaImageKey}
            onChange={setMetaImageKey}
            wide
          />
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <span className="text-sm font-medium">Default preview</span>
              <p className="text-xs text-muted-foreground">
                Used by every link that has no preview of its own.
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
                const res = await savePreviewPreset({
                  id: preset?.id,
                  name,
                  isDefault,
                  metaTitle: metaTitle || null,
                  metaDescription: metaDescription || null,
                  metaImageKey,
                });
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success(preset ? "Preview updated" : "Preview created");
                onClose();
                router.refresh();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : preset ? "Save changes" : "Create preview"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
