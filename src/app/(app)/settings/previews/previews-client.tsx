"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GalleryHorizontalEnd,
  Loader2,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { EmptyState } from "@/components/shell/empty-state";
import { ImageField } from "@/components/branding/image-field";
import { pluralize } from "@/lib/format";
import { SettingsIntro } from "../section";
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
  const [deleting, setDeleting] = useState<Preset | null>(null);
  const router = useRouter();

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="Link previews"
        description="Preview presets define the social card shown when a link lands in Slack, iMessage or LinkedIn. Pick one per link, and mark one as the default for links without their own preview."
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New preview
          </Button>
        }
      />

      {presets.length === 0 ? (
        <EmptyState
          icon={GalleryHorizontalEnd}
          title="No preview presets yet"
          description="Create one per audience: a polished card for investors, a plain one for internal shares."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {presets.map((p, i) => (
            <div
              key={p.id}
              className="stagger-item hover-raise overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-hairline)] hover:border-input"
              style={{ "--i": i } as React.CSSProperties}
            >
              <button
                className="focus-ring block w-full text-left"
                onClick={() => setEditing(p)}
              >
                <span className="flex h-28 items-center justify-center overflow-hidden border-b bg-muted/40">
                  {p.metaImageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/assets/${p.metaImageKey}`}
                      alt=""
                      className="reveal h-full w-full object-cover"
                    />
                  ) : (
                    <GalleryHorizontalEnd
                      className="size-6 text-muted-foreground/40"
                      strokeWidth={1.5}
                    />
                  )}
                </span>
                <span className="block p-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="underline-grow truncate">{p.name}</span>
                    {p.isDefault && (
                      <Star
                        className="size-3.5 shrink-0 fill-[#b7791f] text-[#b7791f]"
                        aria-label="Default preview"
                      />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {p.metaTitle ?? "No title set"}
                  </span>
                </span>
              </button>
              <div className="flex items-center justify-between border-t px-3 py-1.5">
                <span className="text-xs text-muted-foreground">
                  {pluralize(p.linkCount, "link")}
                  {p.isDefault ? " · default" : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete preview ${p.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(p)}
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

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.linkCount > 0
                ? `${pluralize(deleting.linkCount, "link")} use this preview and will fall back to your workspace branding.`
                : "No links use this preview."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep preview</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                const id = deleting?.id;
                setDeleting(null);
                if (!id) return;
                await deletePreviewPreset(id);
                toast.success("Preview deleted");
                router.refresh();
              }}
            >
              Delete preview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const uid = useId();
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
  const dirty =
    name !== (preset?.name ?? "") ||
    metaTitle !== (preset?.metaTitle ?? "") ||
    metaDescription !== (preset?.metaDescription ?? "");

  async function save() {
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
          <DialogTitle>
            {preset ? "Edit preview" : "New preview preset"}
          </DialogTitle>
          <DialogDescription>
            A link&apos;s own preview fields always win over the preset.
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
              placeholder="Investor card"
              aria-invalid={!name.trim()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-title`}>Preview title</Label>
            <Input
              id={`${uid}-title`}
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Acme - Series A materials"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-description`}>Preview description</Label>
            <Textarea
              id={`${uid}-description`}
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
          <div className="flex items-start gap-3 border-t pt-4">
            <div className="min-w-0 flex-1">
              <label
                htmlFor={`${uid}-default`}
                className="cursor-pointer text-sm font-medium select-none"
              >
                Default preview
              </label>
              <p
                id={`${uid}-default-hint`}
                className="text-xs text-muted-foreground"
              >
                Used by every link that has no preview of its own.
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
              {saving ? "Saving…" : preset ? "Save changes" : "Create preview"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
