"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Folder,
  Link2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CopyButton } from "@/components/shell/copy-button";
import { FileIcon } from "@/components/shell/file-icon";
import { ImageField } from "@/components/branding/image-field";
import { cn } from "@/lib/utils";
import type { LinkConfig } from "@/lib/link-config";
import type { DocumentType } from "@prisma/client";
import { createLink, updateLink } from "@/app/(app)/links/actions";

export type TreeItem = {
  kind: "folder" | "document";
  id: string; // DataroomFolder id or DataroomDocument id
  name: string;
  docType?: DocumentType;
  children?: TreeItem[];
};

export type EditorLink = Partial<LinkConfig> & {
  id?: string;
  slug?: string;
  hasPassword?: boolean;
};

/** Slugs end up in a URL, so flag anything that will not survive the trip. */
const SLUG_OK = /^[a-zA-Z0-9._~-]*$/;

export function LinkEditor({
  mode,
  target,
  link,
  domains,
  agreements,
  presets,
  previewPresets = [],
  tree = [],
  appHost,
  trigger,
}: {
  mode: "create" | "edit";
  target: { type: "DOCUMENT" | "DATAROOM"; id: string; name: string };
  link?: EditorLink;
  domains: { id: string; domain: string }[];
  agreements: { id: string; name: string }[];
  presets: { id: string; name: string; isDefault: boolean; config: Partial<LinkConfig> }[];
  previewPresets?: { id: string; name: string; isDefault: boolean }[];
  tree?: TreeItem[];
  appHost: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const uid = useId();

  const defaultPreset = presets.find((p) => p.isDefault);
  const initial: LinkConfig = useMemo(
    () => ({
      name: link?.name ?? target.name,
      slug: link?.slug ?? "",
      domainId: link?.domainId ?? null,
      accessMode: link?.accessMode ?? "PUBLIC",
      password: null,
      expiresAt: link?.expiresAt ?? null,
      allowDownload: link?.allowDownload ?? true,
      allowList: link?.allowList ?? [],
      blockList: link?.blockList ?? [],
      screenshotProtection: link?.screenshotProtection ?? false,
      watermark: link?.watermark ?? false,
      agreementId: link?.agreementId ?? null,
      notifyOnAccess: link?.notifyOnAccess ?? true,
      enableIndexFile: link?.enableIndexFile ?? false,
      enableQA: link?.enableQA ?? false,
      welcomeMessage: link?.welcomeMessage ?? null,
      previewPresetId:
        link?.previewPresetId ??
        (mode === "create"
          ? previewPresets.find((p) => p.isDefault)?.id ?? null
          : null),
      metaTitle: link?.metaTitle ?? null,
      metaDescription: link?.metaDescription ?? null,
      metaImageKey: link?.metaImageKey ?? null,
      fullAccess: link?.fullAccess ?? true,
      permissions: link?.permissions ?? [],
      ...(mode === "create" && defaultPreset ? defaultPreset.config : {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );

  const [cfg, setCfg] = useState<LinkConfig>(initial);
  const set = <K extends keyof LinkConfig>(key: K, value: LinkConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: value }));

  const host =
    domains.find((d) => d.id === cfg.domainId)?.domain ?? appHost;
  const slugInvalid = !SLUG_OK.test(cfg.slug ?? "");
  const nameMissing = !cfg.name.trim();

  async function submit() {
    setSaving(true);
    try {
      const res =
        mode === "create"
          ? await createLink({ type: target.type, id: target.id }, cfg)
          : await updateLink(link!.id!, cfg);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      if (mode === "create") {
        const slug = ("slug" in res && res.slug) || cfg.slug;
        setCreatedUrl(`https://${host}/${slug}`);
        toast.success("Link created");
      } else {
        toast.success("Link updated");
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setCfg((c) => ({ ...c, ...preset.config }));
    toast.message(`Applied preset “${preset.name}”`);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setCfg(initial);
          setCreatedUrl(null);
        }
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="font-display text-xl font-normal">
            {mode === "create" ? "Create link" : "Edit link"}
          </SheetTitle>
          <SheetDescription>
            {target.type === "DATAROOM" ? "Data room" : "Document"} ·{" "}
            {target.name}
          </SheetDescription>
        </SheetHeader>

        {createdUrl ? (
          <div className="reveal-up flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <span className="relative flex size-11 items-center justify-center rounded-full bg-accent">
              {/* One ring outward on arrival: the link is live, said quietly. */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-full motion-safe:animate-[pulse-ring_1.2s_var(--ease-out-quint)_1]"
              />
              <Link2 className="size-5 text-primary" strokeWidth={1.5} />
            </span>
            <div>
              <p className="font-display text-2xl">Your link is live</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Anyone you send it to gets the access you just set.
              </p>
            </div>
            <div className="flex w-full items-center gap-1 rounded-lg border bg-muted/40 px-3 py-2.5 shadow-[var(--shadow-hairline)]">
              <span className="flex-1 truncate text-left font-mono text-sm">
                {createdUrl.replace(/^https?:\/\//, "")}
              </span>
              <CopyButton value={createdUrl} label="Copy" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <a href={createdUrl} target="_blank" rel="noreferrer">
                  Open link <ArrowUpRight className="size-4" />
                </a>
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-5">
              <Section title="The link">
                {mode === "create" && presets.length > 0 && (
                  <Field
                    id={`${uid}-preset`}
                    label="Start from a preset"
                    hint="Fills the settings below with your house standards."
                  >
                    <Select onValueChange={applyPreset}>
                      <SelectTrigger id={`${uid}-preset`}>
                        <SelectValue placeholder="Choose a preset (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {presets.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {p.isDefault ? " · default" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                <Field
                  id={`${uid}-name`}
                  label="Link name"
                  hint="Only you see this. It labels the link in your reports."
                  error={nameMissing ? "Give the link a name." : undefined}
                >
                  <Input
                    id={`${uid}-name`}
                    value={cfg.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Sequoia - Series A"
                    aria-invalid={nameMissing}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field id={`${uid}-domain`} label="Domain">
                    <Select
                      value={cfg.domainId ?? "default"}
                      onValueChange={(v) =>
                        set("domainId", v === "default" ? null : v)
                      }
                    >
                      <SelectTrigger id={`${uid}-domain`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">{appHost}</SelectItem>
                        {domains.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.domain}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    id={`${uid}-slug`}
                    label="Path"
                    hint="Blank for a random path"
                    error={
                      slugInvalid
                        ? "Use letters, numbers, dots or hyphens."
                        : undefined
                    }
                  >
                    <Input
                      id={`${uid}-slug`}
                      value={cfg.slug ?? ""}
                      onChange={(e) => set("slug", e.target.value)}
                      placeholder="auto"
                      className="font-mono"
                      aria-invalid={slugInvalid}
                      spellCheck={false}
                      autoCapitalize="off"
                    />
                  </Field>
                </div>

                <div className="flex items-center gap-1 rounded-md border bg-muted/40 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {host}/
                    <span
                      className={cn(
                        "transition-colors duration-[var(--dur)]",
                        cfg.slug && "text-foreground"
                      )}
                    >
                      {cfg.slug || "•••••••••"}
                    </span>
                  </span>
                  {cfg.slug && !slugInvalid && (
                    <CopyButton value={`https://${host}/${cfg.slug}`} />
                  )}
                </div>
              </Section>

              <Section
                title="Who can open it"
                caption="Everything here is checked before a single page renders."
              >
                <Field label="Identity verification" as="div">
                  <RadioGroup
                    value={cfg.accessMode}
                    onValueChange={(v) =>
                      set("accessMode", v as LinkConfig["accessMode"])
                    }
                    aria-label="Identity verification"
                    className="gap-2"
                  >
                    <RadioRow
                      value="PUBLIC"
                      title="No email"
                      caption="Anyone with the link can view instantly."
                    />
                    <RadioRow
                      value="EMAIL"
                      title="Email"
                      caption="Visitors enter an email before viewing. Not verified."
                    />
                    <RadioRow
                      value="EMAIL_VERIFIED"
                      title="Verified email"
                      caption="Visitors confirm their email with a magic link."
                    />
                  </RadioGroup>
                </Field>

                <ToggleSection
                  title="Allow and block list"
                  caption={describeLists(cfg.allowList, cfg.blockList)}
                  defaultOpen={
                    cfg.allowList.length > 0 || cfg.blockList.length > 0
                  }
                >
                  <Field
                    id={`${uid}-allow`}
                    label="Allow"
                    hint="One per line. Use @company.com to allow a whole domain. Empty allows everyone not blocked."
                  >
                    <Textarea
                      id={`${uid}-allow`}
                      rows={3}
                      className="font-mono text-xs"
                      spellCheck={false}
                      value={cfg.allowList.join("\n")}
                      onChange={(e) =>
                        set("allowList", e.target.value.split("\n"))
                      }
                      placeholder={"jane@fund.com\n@partners.vc"}
                    />
                  </Field>
                  <Field id={`${uid}-block`} label="Block">
                    <Textarea
                      id={`${uid}-block`}
                      rows={2}
                      className="font-mono text-xs"
                      spellCheck={false}
                      value={cfg.blockList.join("\n")}
                      onChange={(e) =>
                        set("blockList", e.target.value.split("\n"))
                      }
                      placeholder="@competitor.com"
                    />
                  </Field>
                </ToggleSection>

                <ToggleSection
                  title="Password protection"
                  caption={
                    cfg.clearPassword
                      ? "Will be removed on save"
                      : cfg.password
                        ? "A new password will be set on save"
                        : link?.hasPassword
                          ? "Password is set"
                          : "Off"
                  }
                  defaultOpen={false}
                >
                  <Field
                    id={`${uid}-password`}
                    label={link?.hasPassword ? "Replace password" : "Password"}
                    hint="Visitors are asked for this in addition to anything above."
                  >
                    <Input
                      id={`${uid}-password`}
                      type="text"
                      className="font-mono"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={cfg.clearPassword ?? false}
                      value={cfg.password ?? ""}
                      onChange={(e) => set("password", e.target.value || null)}
                      placeholder={
                        link?.hasPassword ? "Leave blank to keep current" : ""
                      }
                    />
                  </Field>
                  {link?.hasPassword && (
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={cfg.clearPassword ?? false}
                        onCheckedChange={(v) => set("clearPassword", v === true)}
                      />
                      Remove password
                    </label>
                  )}
                </ToggleSection>

                <Field
                  id={`${uid}-expires`}
                  label="Expiration date"
                  hint="Blank for no expiry. The link stops working at the end of the chosen day."
                >
                  <Input
                    id={`${uid}-expires`}
                    type="date"
                    className="w-fit tabular"
                    value={cfg.expiresAt ? cfg.expiresAt.slice(0, 10) : ""}
                    onChange={(e) =>
                      set(
                        "expiresAt",
                        e.target.value
                          ? new Date(`${e.target.value}T23:59:59`).toISOString()
                          : null
                      )
                    }
                  />
                </Field>
              </Section>

              <Section title="What they can do">
                <div className="divide-y">
                  <SwitchRow
                    id={`${uid}-download`}
                    title="Allow downloads"
                    caption="Visitors can download the original files"
                    checked={cfg.allowDownload}
                    onChange={(v) => set("allowDownload", v)}
                  />
                  <SwitchRow
                    id={`${uid}-screenshot`}
                    title="Screenshot deterrence"
                    caption="Disables selection, right-click and printing in the viewer"
                    checked={cfg.screenshotProtection}
                    onChange={(v) => set("screenshotProtection", v)}
                  />
                  <SwitchRow
                    id={`${uid}-watermark`}
                    title="Dynamic watermark"
                    caption="Overlays the visitor's email and timestamp on every page"
                    checked={cfg.watermark}
                    onChange={(v) => set("watermark", v)}
                  />
                  <SwitchRow
                    id={`${uid}-notify`}
                    title="Notify on access"
                    caption="Email your team each time this link is opened"
                    checked={cfg.notifyOnAccess}
                    onChange={(v) => set("notifyOnAccess", v)}
                  />
                </div>

                <Field
                  id={`${uid}-nda`}
                  label="NDA agreement"
                  hint={
                    cfg.agreementId
                      ? "Visitors sign before they see anything. Every signature is recorded."
                      : undefined
                  }
                >
                  <Select
                    value={cfg.agreementId ?? "none"}
                    onValueChange={(v) =>
                      set("agreementId", v === "none" ? null : v)
                    }
                  >
                    <SelectTrigger id={`${uid}-nda`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No agreement</SelectItem>
                      {agreements.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </Section>

              <Section title="What they see first">
                <ToggleSection
                  title="Welcome and link preview"
                  caption="Front page message and social card"
                  defaultOpen={
                    !!(
                      cfg.welcomeMessage ||
                      cfg.metaTitle ||
                      cfg.metaImageKey ||
                      cfg.previewPresetId
                    )
                  }
                >
                  <Field
                    id={`${uid}-welcome`}
                    label="Welcome message"
                    hint="Shown on the access screen before the content"
                  >
                    <Textarea
                      id={`${uid}-welcome`}
                      rows={3}
                      value={cfg.welcomeMessage ?? ""}
                      onChange={(e) =>
                        set("welcomeMessage", e.target.value || null)
                      }
                      placeholder="A short note for your visitors…"
                    />
                  </Field>
                  {previewPresets.length > 0 && (
                    <Field
                      id={`${uid}-preview-preset`}
                      label="Link preview preset"
                      hint="Manage presets in Settings, Link previews. Fields set below override the preset."
                    >
                      <Select
                        value={cfg.previewPresetId ?? "none"}
                        onValueChange={(v) =>
                          set("previewPresetId", v === "none" ? null : v)
                        }
                      >
                        <SelectTrigger id={`${uid}-preview-preset`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No preset</SelectItem>
                          {previewPresets.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                              {p.isDefault ? " · default" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  <Field id={`${uid}-meta-title`} label="Preview title">
                    <Input
                      id={`${uid}-meta-title`}
                      value={cfg.metaTitle ?? ""}
                      onChange={(e) => set("metaTitle", e.target.value || null)}
                      placeholder="Shown when the link is shared"
                    />
                  </Field>
                  <Field
                    id={`${uid}-meta-description`}
                    label="Preview description"
                  >
                    <Textarea
                      id={`${uid}-meta-description`}
                      rows={2}
                      value={cfg.metaDescription ?? ""}
                      onChange={(e) =>
                        set("metaDescription", e.target.value || null)
                      }
                    />
                  </Field>
                  <ImageField
                    label="Preview image"
                    hint="Shown in Slack, iMessage, LinkedIn cards. Roughly 1200×630 works best."
                    value={cfg.metaImageKey ?? null}
                    onChange={(k) => set("metaImageKey", k)}
                    wide
                  />
                </ToggleSection>
              </Section>

              {target.type === "DATAROOM" && (
                <Section
                  title="Scope"
                  caption="Which of this room's contents the link reaches."
                >
                  <div className="divide-y">
                    <SwitchRow
                      id={`${uid}-full-access`}
                      title="Share entire data room"
                      caption="Turn off to choose exactly which files and folders this link can access"
                      checked={cfg.fullAccess}
                      onChange={(v) => set("fullAccess", v)}
                    />
                  </div>
                  <Reveal show={!cfg.fullAccess}>
                    <PermissionTree
                      tree={tree}
                      permissions={cfg.permissions}
                      allowDownload={cfg.allowDownload}
                      onChange={(perms) => set("permissions", perms)}
                    />
                  </Reveal>

                  <div className="divide-y">
                    <SwitchRow
                      id={`${uid}-index`}
                      title="Index file"
                      caption="Offer a generated table of contents for download"
                      checked={cfg.enableIndexFile}
                      onChange={(v) => set("enableIndexFile", v)}
                    />
                    <SwitchRow
                      id={`${uid}-qa`}
                      title="Q&A"
                      caption="Visitors can ask questions inside the data room"
                      checked={cfg.enableQA}
                      onChange={(v) => set("enableQA", v)}
                    />
                  </div>
                </Section>
              )}

              <AccessSummary cfg={cfg} link={link} isDataroom={target.type === "DATAROOM"} />
            </div>

            <SheetFooter className="border-t">
              <Button
                onClick={submit}
                disabled={saving || nameMissing || slugInvalid}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving
                  ? "Saving…"
                  : mode === "create"
                    ? "Create link"
                    : "Save changes"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A quiet grouping heading, set like a page's running head. */
function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline">
        <h3 className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </h3>
        <span aria-hidden className="leader-dots text-muted-foreground/60" />
      </div>
      {caption && (
        <p className="-mt-2 text-xs text-muted-foreground">{caption}</p>
      )}
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  as: As = "label",
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  /** Use "div" for groups (radios) that own their own labelling. */
  as?: "label" | "div";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {As === "label" ? (
        <Label htmlFor={id}>{label}</Label>
      ) : (
        <p className="text-sm leading-none font-medium">{label}</p>
      )}
      {children}
      {/* Reserve the hint line so an error appearing does not shift anything. */}
      {(hint || error) && (
        <p
          id={id ? (error ? `${id}-error` : `${id}-hint`) : undefined}
          role={error ? "alert" : undefined}
          className={cn(
            "text-xs",
            error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function RadioRow({
  value,
  title,
  caption,
}: {
  value: string;
  title: string;
  caption: string;
}) {
  return (
    <label className="press flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:shadow-[var(--shadow-hairline)] has-focus-visible:border-ring">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{caption}</span>
      </span>
    </label>
  );
}

function SwitchRow({
  id,
  title,
  caption,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  caption: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className="cursor-pointer text-sm font-medium select-none"
        >
          {title}
        </label>
        <p id={`${id}-caption`} className="text-xs text-muted-foreground">
          {caption}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={`${id}-caption`}
        className="mt-0.5"
      />
    </div>
  );
}

/**
 * Dependent controls that grow in when their parent turns on. The 0fr/1fr grid
 * is the only way to transition to an unknown content height, and `inert` keeps
 * the hidden fields out of the tab order without unmounting them.
 */
function Reveal({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-[var(--dur)] ease-[var(--ease-out-quint)]",
        show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="overflow-hidden" inert={!show}>
        {children}
      </div>
    </div>
  );
}

function ToggleSection({
  title,
  caption,
  defaultOpen,
  children,
}: {
  title: string;
  caption?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-md border bg-muted/20 px-3 py-2"
    >
      <CollapsibleTrigger className="group focus-ring flex w-full items-center justify-between gap-3 rounded-md py-1 text-left">
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          {caption && (
            <div className="truncate text-xs text-muted-foreground">
              {caption}
            </div>
          )}
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--dur)] ease-[var(--ease-out-quint)] group-data-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden duration-[var(--dur)] ease-[var(--ease-out-quint)] data-closed:animate-collapsible-up data-open:animate-collapsible-down">
        <div className="space-y-4 pt-3 pb-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function describeLists(allow: string[], block: string[]): string {
  const a = allow.filter((x) => x.trim()).length;
  const b = block.filter((x) => x.trim()).length;
  if (!a && !b) return "Off";
  const bits: string[] = [];
  if (a) bits.push(`${a} allowed`);
  if (b) bits.push(`${b} blocked`);
  return bits.join(" · ");
}

/**
 * The rules as the recipient will meet them, in order. A sender about to paste
 * this link into an email should be able to read this and be sure.
 */
function AccessSummary({
  cfg,
  link,
  isDataroom,
}: {
  cfg: LinkConfig;
  link?: EditorLink;
  isDataroom: boolean;
}) {
  const rows = useMemo(() => {
    const passwordSet = cfg.clearPassword
      ? false
      : !!cfg.password || !!link?.hasPassword;
    const allow = cfg.allowList.filter((x) => x.trim());
    const block = cfg.blockList.filter((x) => x.trim());
    const out: { label: string; value: string; strong?: boolean }[] = [
      {
        label: "Audience",
        value:
          cfg.accessMode === "PUBLIC"
            ? "Anyone with the link"
            : cfg.accessMode === "EMAIL"
              ? "Anyone who gives an email"
              : "Confirmed email addresses only",
      },
    ];
    if (allow.length)
      out.push({ label: "Restricted to", value: `${allow.length} entries` });
    if (block.length)
      out.push({ label: "Blocked", value: `${block.length} entries` });
    out.push({ label: "Password", value: passwordSet ? "Required" : "None" });
    out.push({
      label: "Expires",
      value: cfg.expiresAt
        ? new Date(cfg.expiresAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "Never",
    });
    if (cfg.agreementId) out.push({ label: "NDA", value: "Signed first" });
    out.push({
      label: "Downloads",
      value: cfg.allowDownload ? "Allowed" : "Blocked",
    });
    if (cfg.watermark) out.push({ label: "Watermark", value: "On every page" });
    if (cfg.screenshotProtection)
      out.push({ label: "Screenshots", value: "Deterred" });
    if (isDataroom)
      out.push({
        label: "Reaches",
        value: cfg.fullAccess
          ? "Everything in the room"
          : `${cfg.permissions.filter((p) => p.canView).length} selected items`,
      });
    out.push({
      label: "You are told",
      value: cfg.notifyOnAccess ? "On every open" : "Never",
    });
    return out;
  }, [cfg, link?.hasPassword, isDataroom]);

  return (
    <section className="rounded-lg border bg-muted/30 px-4 py-3.5">
      <h3 className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <Check className="size-3 text-primary" strokeWidth={2.5} />
        What a visitor meets
      </h3>
      <dl className="mt-2.5 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline text-xs">
            <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
            <span aria-hidden className="leader-dots text-muted-foreground/70" />
            <dd className="shrink-0 text-right tabular">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PermissionTree({
  tree,
  permissions,
  allowDownload,
  onChange,
}: {
  tree: TreeItem[];
  permissions: LinkConfig["permissions"];
  allowDownload: boolean;
  onChange: (p: LinkConfig["permissions"]) => void;
}) {
  function grantOf(item: TreeItem) {
    return permissions.find(
      (p) =>
        p.itemId === item.id &&
        p.itemType ===
          (item.kind === "folder" ? "DATAROOM_FOLDER" : "DATAROOM_DOCUMENT")
    );
  }

  function collectIds(item: TreeItem): { type: "DATAROOM_DOCUMENT" | "DATAROOM_FOLDER"; id: string }[] {
    const self = {
      type: (item.kind === "folder"
        ? "DATAROOM_FOLDER"
        : "DATAROOM_DOCUMENT") as "DATAROOM_DOCUMENT" | "DATAROOM_FOLDER",
      id: item.id,
    };
    return [self, ...(item.children ?? []).flatMap(collectIds)];
  }

  function toggle(item: TreeItem, field: "canView" | "canDownload", value: boolean) {
    const targets = collectIds(item);
    let next = [...permissions];
    for (const t of targets) {
      const idx = next.findIndex(
        (p) => p.itemId === t.id && p.itemType === t.type
      );
      const existing =
        idx >= 0
          ? next[idx]
          : { itemType: t.type, itemId: t.id, canView: false, canDownload: false };
      const updated = { ...existing, [field]: value };
      if (field === "canDownload" && value) updated.canView = true;
      if (field === "canView" && !value) updated.canDownload = false;
      if (idx >= 0) next[idx] = updated;
      else next = [...next, updated];
    }
    onChange(next);
  }

  function renderItems(items: TreeItem[], depth: number) {
    return items.map((item) => {
      const grant = grantOf(item);
      return (
        <div key={`${item.kind}-${item.id}`}>
          <div
            className="group flex items-center gap-2 rounded-sm py-1.5 pr-1 transition-colors duration-[var(--dur-fast)] hover:bg-muted/60"
            style={{ paddingLeft: depth * 16 }}
          >
            {item.kind === "folder" ? (
              <Folder className="size-4 shrink-0 text-[#b7791f]" strokeWidth={1.5} />
            ) : (
              <FileIcon type={item.docType ?? "OTHER"} />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
            <label className="flex w-11 shrink-0 justify-center">
              <span className="sr-only">View {item.name}</span>
              <Checkbox
                checked={grant?.canView ?? false}
                onCheckedChange={(v) => toggle(item, "canView", v === true)}
              />
            </label>
            <label
              className={cn(
                "flex w-16 shrink-0 justify-center transition-opacity duration-[var(--dur)]",
                !allowDownload && "opacity-40"
              )}
            >
              <span className="sr-only">Allow download of {item.name}</span>
              <Checkbox
                disabled={!allowDownload}
                checked={grant?.canDownload ?? false}
                onCheckedChange={(v) =>
                  toggle(item, "canDownload", v === true)
                }
              />
            </label>
          </div>
          {item.children && renderItems(item.children, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="rounded-md border px-3 py-2">
      {/* Column heads once, so each row is a name and two marks, not a sentence. */}
      <div className="flex items-center gap-2 border-b pb-1.5 pr-1">
        <span className="flex-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Item permissions
        </span>
        <span className="w-11 shrink-0 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          view
        </span>
        <span
          className={cn(
            "w-16 shrink-0 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-opacity duration-[var(--dur)]",
            !allowDownload && "opacity-40"
          )}
        >
          download
        </span>
      </div>
      {tree.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          This data room has no content yet.
        </p>
      ) : (
        <div className="pt-1">{renderItems(tree, 0)}</div>
      )}
      {!allowDownload && tree.length > 0 && (
        <p className="mt-1.5 border-t pt-1.5 text-xs text-muted-foreground">
          Downloads are off for the whole link, so per-item downloads are
          unavailable.
        </p>
      )}
    </div>
  );
}
