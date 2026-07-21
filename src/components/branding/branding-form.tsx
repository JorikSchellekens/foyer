"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Loader2, RotateCcw } from "lucide-react";
import { ImageField } from "@/components/branding/image-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  saveBranding,
  resetBranding,
  scrapeBranding,
  importImageFromUrl,
  type BrandingInput,
} from "@/app/(app)/settings/branding/actions";

export type BrandingValues = {
  logoKey: string | null;
  bannerKey: string | null;
  brandColor: string;
  backgroundColor: string;
  applyBgToDataroom: boolean;
  welcomeMessage: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaImageKey: string | null;
};

const DEFAULTS: BrandingValues = {
  logoKey: null,
  bannerKey: null,
  brandColor: "#175B47",
  backgroundColor: "#101418",
  applyBgToDataroom: false,
  welcomeMessage: null,
  ctaLabel: null,
  ctaUrl: null,
  metaTitle: null,
  metaDescription: null,
  metaImageKey: null,
};

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 font-mono text-sm"
        />
      </div>
    </div>
  );
}

export function BrandingForm({
  initial,
  dataroomId,
  showDataroomFields = true,
}: {
  initial: BrandingValues | null;
  dataroomId?: string;
  showDataroomFields?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<BrandingValues>(initial ?? DEFAULTS);
  const [site, setSite] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof BrandingValues>(k: K, val: BrandingValues[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  async function autofill() {
    setFetching(true);
    try {
      const res = await scrapeBranding(site);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res.themeColor && /^#[0-9a-fA-F]{6}$/.test(res.themeColor))
        set("brandColor", res.themeColor);
      if (res.title) set("metaTitle", res.title);
      if (res.description) set("metaDescription", res.description);
      if (res.logoUrl) {
        const imp = await importImageFromUrl(res.logoUrl);
        if ("key" in imp && imp.key) set("logoKey", imp.key);
      }
      if (res.bannerUrl) {
        const imp = await importImageFromUrl(res.bannerUrl);
        if ("key" in imp && imp.key) {
          set("bannerKey", imp.key);
          set("metaImageKey", imp.key);
        }
      }
      toast.success("Pulled branding. Tweak anything below before saving.");
    } finally {
      setFetching(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await saveBranding({
        ...(v as BrandingInput),
        dataroomId: dataroomId ?? null,
      });
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Branding saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <Label className="flex items-center gap-1.5">
          <Globe className="size-3.5" /> Auto-fill from website
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a website URL and we pull the logo, banner and brand colors.
          You can tweak everything before saving.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="company.com"
          />
          <Button
            variant="outline"
            onClick={autofill}
            disabled={fetching || !site.trim()}
          >
            {fetching ? <Loader2 className="size-4 animate-spin" /> : "Fetch"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ImageField
          label="Logo"
          hint="Shown in the viewer header. Max 2 MB."
          value={v.logoKey}
          onChange={(k) => set("logoKey", k)}
        />
        <ImageField
          label="Banner"
          hint="Data room front pages. Max 2 MB."
          value={v.bannerKey}
          onChange={(k) => set("bannerKey", k)}
          wide
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ColorField
          label="Brand color"
          value={v.brandColor}
          onChange={(c) => set("brandColor", c)}
        />
        <ColorField
          label="Background color (front page)"
          value={v.backgroundColor}
          onChange={(c) => set("backgroundColor", c)}
        />
      </div>

      {showDataroomFields && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">
              Apply background to data room view
            </div>
            <div className="text-xs text-muted-foreground">
              Use the background color behind the data room index, not only the
              front page.
            </div>
          </div>
          <Switch
            checked={v.applyBgToDataroom}
            onCheckedChange={(c) => set("applyBgToDataroom", c)}
          />
        </div>
      )}

      <Separator />

      <div className="space-y-1.5">
        <Label>Welcome message (front page)</Label>
        <Textarea
          rows={3}
          value={v.welcomeMessage ?? ""}
          onChange={(e) => set("welcomeMessage", e.target.value || null)}
          placeholder="Shown to visitors on the access screen before they see your content."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Call to action label</Label>
          <Input
            value={v.ctaLabel ?? ""}
            onChange={(e) => set("ctaLabel", e.target.value || null)}
            placeholder="Book a meeting"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Call to action URL</Label>
          <Input
            value={v.ctaUrl ?? ""}
            onChange={(e) => set("ctaUrl", e.target.value || null)}
            placeholder="https://cal.com/you"
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <div className="text-sm font-medium">Custom link preview</div>
          <p className="text-xs text-muted-foreground">
            Default social card for every link. Per-link previews override
            this.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Preview title</Label>
          <Input
            value={v.metaTitle ?? ""}
            onChange={(e) => set("metaTitle", e.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Preview description</Label>
          <Textarea
            rows={2}
            value={v.metaDescription ?? ""}
            onChange={(e) => set("metaDescription", e.target.value || null)}
          />
        </div>
        <ImageField
          label="Preview image"
          value={v.metaImageKey}
          onChange={(k) => set("metaImageKey", k)}
          wide
        />
      </div>

      <div className="flex items-center gap-3 border-t pt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await resetBranding(dataroomId ?? null);
            setV(DEFAULTS);
            toast.success("Branding reset");
            router.refresh();
          }}
        >
          <RotateCcw className="size-3.5" /> Reset branding
        </Button>
      </div>
    </div>
  );
}
