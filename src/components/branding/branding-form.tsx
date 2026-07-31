"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Globe,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { ImageField } from "@/components/branding/image-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { HEX, contrastText } from "@/lib/contrast";
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

/** Relative luminance, WCAG 2.1 definition. */
function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const channel = (i: number) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

function ColorField({
  label,
  hint,
  value,
  onChange,
  /** Surface this color will sit on, for the contrast reading. */
  against,
  againstLabel,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  against: string;
  againstLabel: string;
}) {
  const id = useId();
  const valid = HEX.test(value);
  const ratio = valid && HEX.test(against) ? contrastRatio(value, against) : null;
  // 3:1 is the WCAG minimum for interface components and large text, which is
  // what a brand color is used for here.
  const weak = ratio !== null && ratio < 3;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <label
          className={cn(
            "relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-transparent transition-[border-color,box-shadow] duration-[var(--dur)] hover:border-input",
            weak && "border-destructive/50"
          )}
          style={valid ? { backgroundColor: value } : undefined}
        >
          <span className="sr-only">Pick {label}</span>
          <input
            type="color"
            value={valid ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -inset-2 cursor-pointer opacity-0"
          />
        </label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 font-mono text-sm uppercase"
          spellCheck={false}
          aria-invalid={!valid}
          aria-describedby={`${id}-note`}
        />
        {ratio !== null && (
          <span
            className={cn(
              "font-mono text-xs tabular",
              weak ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {ratio.toFixed(1)}:1
          </span>
        )}
      </div>
      <p
        id={`${id}-note`}
        role={!valid || weak ? "alert" : undefined}
        className={cn(
          "flex items-start gap-1 text-xs",
          !valid || weak ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {(!valid || weak) && (
          <AlertTriangle className="mt-px size-3 shrink-0" />
        )}
        {!valid
          ? "Use a six-digit hex color, like #175B47."
          : weak
            ? `Low contrast against ${againstLabel}. Text and buttons in this color will be hard to read.`
            : (hint ?? `Contrast against ${againstLabel}.`)}
      </p>
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
  const uid = useId();
  const [v, setV] = useState<BrandingValues>(initial ?? DEFAULTS);
  const [site, setSite] = useState("");
  const [fetching, setFetching] = useState(false);
  const [found, setFound] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const set = <K extends keyof BrandingValues>(k: K, val: BrandingValues[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  async function autofill() {
    setFetching(true);
    setFound(null);
    try {
      const res = await scrapeBranding(site);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      // Name what was actually taken, so the jump in the form is explained.
      const picked: string[] = [];
      if (res.themeColor && /^#[0-9a-fA-F]{6}$/.test(res.themeColor)) {
        set("brandColor", res.themeColor);
        picked.push(`brand color ${res.themeColor.toUpperCase()}`);
      }
      if (res.title) {
        set("metaTitle", res.title);
        picked.push("preview title");
      }
      if (res.description) {
        set("metaDescription", res.description);
        picked.push("preview description");
      }
      if (res.logoUrl) {
        const imp = await importImageFromUrl(res.logoUrl);
        if ("key" in imp && imp.key) {
          set("logoKey", imp.key);
          picked.push("logo");
        }
      }
      if (res.bannerUrl) {
        const imp = await importImageFromUrl(res.bannerUrl);
        if ("key" in imp && imp.key) {
          set("bannerKey", imp.key);
          set("metaImageKey", imp.key);
          picked.push("banner");
        }
      }
      setFound(picked);
      toast.success(
        picked.length
          ? "Pulled branding. Tweak anything below before saving."
          : "Nothing usable found on that page."
      );
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
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border bg-card p-4 shadow-[var(--shadow-hairline)]">
        <Label htmlFor={`${uid}-site`} className="flex items-center gap-1.5">
          <Globe className="size-3.5" /> Auto-fill from website
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a website URL and we pull the logo, banner and brand colors.
          You can tweak everything before saving.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            id={`${uid}-site`}
            value={site}
            onChange={(e) => setSite(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && site.trim() && !fetching) {
                e.preventDefault();
                void autofill();
              }
            }}
            placeholder="company.com"
            spellCheck={false}
            autoCapitalize="off"
          />
          <Button
            variant="outline"
            onClick={autofill}
            disabled={fetching || !site.trim()}
            className="shrink-0"
          >
            {fetching ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Reading…
              </>
            ) : (
              "Fetch"
            )}
          </Button>
        </div>
        <div aria-live="polite">
          {fetching && (
            <p className="reveal mt-2 text-xs text-muted-foreground">
              Fetching the page, then its logo and colors. This takes a few
              seconds.
            </p>
          )}
          {!fetching && found && found.length > 0 && (
            <div className="reveal-up mt-3 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3 text-primary" strokeWidth={2.5} />
                Found
              </span>
              {found.map((f) => (
                <span
                  key={f}
                  className="rounded-full border bg-accent px-2 py-0.5 text-xs text-accent-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
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
          against={v.backgroundColor}
          againstLabel="the front page background"
        />
        <ColorField
          label="Background color (front page)"
          value={v.backgroundColor}
          onChange={(c) => set("backgroundColor", c)}
          against={contrastText(v.backgroundColor)}
          againstLabel="its own text"
        />
      </div>

      <FrontPagePreview values={v} />

      {showDataroomFields && (
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <label
              htmlFor={`${uid}-apply-bg`}
              className="cursor-pointer text-sm font-medium select-none"
            >
              Apply background to data room view
            </label>
            <p
              id={`${uid}-apply-bg-hint`}
              className="text-xs text-muted-foreground"
            >
              Use the background color behind the data room index, not only the
              front page.
            </p>
          </div>
          <Switch
            id={`${uid}-apply-bg`}
            aria-describedby={`${uid}-apply-bg-hint`}
            checked={v.applyBgToDataroom}
            onCheckedChange={(c) => set("applyBgToDataroom", c)}
            className="mt-1"
          />
        </div>
      )}

      <Separator />

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-welcome`}>Welcome message (front page)</Label>
        <Textarea
          id={`${uid}-welcome`}
          rows={3}
          value={v.welcomeMessage ?? ""}
          onChange={(e) => set("welcomeMessage", e.target.value || null)}
          placeholder="Shown to visitors on the access screen before they see your content."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-cta-label`}>Call to action label</Label>
          <Input
            id={`${uid}-cta-label`}
            value={v.ctaLabel ?? ""}
            onChange={(e) => set("ctaLabel", e.target.value || null)}
            placeholder="Book a meeting"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-cta-url`}>Call to action URL</Label>
          <Input
            id={`${uid}-cta-url`}
            type="url"
            value={v.ctaUrl ?? ""}
            onChange={(e) => set("ctaUrl", e.target.value || null)}
            placeholder="https://cal.com/you"
            spellCheck={false}
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
          <Label htmlFor={`${uid}-meta-title`}>Preview title</Label>
          <Input
            id={`${uid}-meta-title`}
            value={v.metaTitle ?? ""}
            onChange={(e) => set("metaTitle", e.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-meta-description`}>Preview description</Label>
          <Textarea
            id={`${uid}-meta-description`}
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
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await resetBranding(dataroomId ?? null);
            setV(DEFAULTS);
            setSavedAt(null);
            toast.success("Branding reset");
            router.refresh();
          }}
        >
          <RotateCcw className="size-3.5" /> Reset branding
        </Button>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {savedAt && !saving && (
            <span className="reveal inline-flex items-center gap-1">
              <Check className="size-3 text-primary" strokeWidth={2.5} />
              Saved
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * The front page as a visitor meets it: same background, same ink choice, same
 * stacking. Small enough to sit inside the form, close enough that nobody has
 * to open a link to check their colors.
 */
function FrontPagePreview({ values }: { values: BrandingValues }) {
  const bg = HEX.test(values.backgroundColor)
    ? values.backgroundColor
    : DEFAULTS.backgroundColor;
  const brand = HEX.test(values.brandColor)
    ? values.brandColor
    : DEFAULTS.brandColor;
  const ink = contrastText(bg);

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Front page preview
      </p>
      <div className="overflow-hidden rounded-lg border shadow-[var(--shadow-hairline)]">
        <div
          className="transition-colors duration-[var(--dur-slow)] ease-[var(--ease-out-soft)]"
          style={{ backgroundColor: bg, color: ink }}
        >
          {values.bannerKey && (
            <div className="h-16 w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/assets/${values.bannerKey}`}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="flex flex-col items-start gap-3 px-5 py-6">
            {values.logoKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/assets/${values.logoKey}`}
                alt=""
                className="h-7 w-auto max-w-32 object-contain"
              />
            ) : (
              <span
                className="flex size-7 items-center justify-center rounded-md font-mono text-sm font-bold transition-colors duration-[var(--dur-slow)]"
                style={{ backgroundColor: brand, color: contrastText(brand) }}
              >
                A
              </span>
            )}
            <div>
              <p className="text-xs opacity-60">Your workspace shared</p>
              <p className="font-display text-xl leading-tight">
                Series A materials
              </p>
            </div>
            {values.welcomeMessage && (
              <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed opacity-80">
                {values.welcomeMessage}
              </p>
            )}
            <span
              className="mt-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--dur-slow)]"
              style={{ backgroundColor: brand, color: contrastText(brand) }}
            >
              {values.ctaLabel?.trim() || "Continue"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
