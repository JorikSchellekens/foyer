"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Folder, Link2 } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
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

export function LinkEditor({
  mode,
  target,
  link,
  domains,
  agreements,
  presets,
  previewPresets = [],
  groups = [],
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
  groups?: { id: string; name: string }[];
  tree?: TreeItem[];
  appHost: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

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
      groupId: link?.groupId ?? null,
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
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
            <Link2 className="size-8 text-primary" strokeWidth={1.25} />
            <p className="font-display text-2xl">Your link is live</p>
            <div className="flex w-full items-center gap-1 rounded-md border bg-muted/50 px-3 py-2">
              <span className="flex-1 truncate font-mono text-sm">
                {createdUrl}
              </span>
              <CopyButton value={createdUrl} />
            </div>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {mode === "create" && presets.length > 0 && (
                <Field label="Start from a preset">
                  <Select onValueChange={applyPreset}>
                    <SelectTrigger>
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

              <Field label="Link name">
                <Input
                  value={cfg.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Sequoia — Series A"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Domain">
                  <Select
                    value={cfg.domainId ?? "default"}
                    onValueChange={(v) =>
                      set("domainId", v === "default" ? null : v)
                    }
                  >
                    <SelectTrigger>
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
                <Field label="Path" hint="Blank for a random path">
                  <Input
                    value={cfg.slug ?? ""}
                    onChange={(e) => set("slug", e.target.value)}
                    placeholder="auto"
                  />
                </Field>
              </div>

              <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                {host}/{cfg.slug || "•••••••••"}
              </div>

              <Separator />

              <Field label="Identity verification">
                <RadioGroup
                  value={cfg.accessMode}
                  onValueChange={(v) =>
                    set("accessMode", v as LinkConfig["accessMode"])
                  }
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
                title="Allow & block list"
                caption="Restrict by email address or domain"
                defaultOpen={
                  cfg.allowList.length > 0 || cfg.blockList.length > 0
                }
              >
                <Field
                  label="Allow"
                  hint="One per line. Use @company.com to allow a whole domain. Empty allows everyone not blocked."
                >
                  <Textarea
                    rows={3}
                    value={cfg.allowList.join("\n")}
                    onChange={(e) =>
                      set("allowList", e.target.value.split("\n"))
                    }
                    placeholder={"jane@fund.com\n@partners.vc"}
                  />
                </Field>
                <Field label="Block">
                  <Textarea
                    rows={2}
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
                caption={link?.hasPassword ? "Password is set" : "Off"}
                defaultOpen={false}
              >
                <Field
                  label={
                    link?.hasPassword ? "Replace password" : "Password"
                  }
                >
                  <Input
                    type="text"
                    value={cfg.password ?? ""}
                    onChange={(e) => set("password", e.target.value || null)}
                    placeholder={
                      link?.hasPassword ? "Leave blank to keep current" : ""
                    }
                  />
                </Field>
                {link?.hasPassword && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={cfg.clearPassword ?? false}
                      onCheckedChange={(v) => set("clearPassword", v === true)}
                    />
                    Remove password
                  </label>
                )}
              </ToggleSection>

              <Field label="Expiration date" hint="Blank for no expiry">
                <Input
                  type="date"
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

              <div className="space-y-3">
                <SwitchRow
                  title="Allow downloads"
                  caption="Visitors can download the original files"
                  checked={cfg.allowDownload}
                  onChange={(v) => set("allowDownload", v)}
                />
                <SwitchRow
                  title="Screenshot deterrence"
                  caption="Disables selection, right-click and printing in the viewer"
                  checked={cfg.screenshotProtection}
                  onChange={(v) => set("screenshotProtection", v)}
                />
                <SwitchRow
                  title="Dynamic watermark"
                  caption="Overlays the visitor's email and timestamp on every page"
                  checked={cfg.watermark}
                  onChange={(v) => set("watermark", v)}
                />
                <SwitchRow
                  title="Notify on access"
                  caption="Email your team each time this link is opened"
                  checked={cfg.notifyOnAccess}
                  onChange={(v) => set("notifyOnAccess", v)}
                />
              </div>

              <Field label="NDA agreement">
                <Select
                  value={cfg.agreementId ?? "none"}
                  onValueChange={(v) =>
                    set("agreementId", v === "none" ? null : v)
                  }
                >
                  <SelectTrigger>
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

              <ToggleSection
                title="Welcome & link preview"
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
                  label="Welcome message"
                  hint="Shown on the access screen before the content"
                >
                  <Textarea
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
                    label="Link preview preset"
                    hint="Manage presets in Settings → Link previews. Fields set below override the preset."
                  >
                    <Select
                      value={cfg.previewPresetId ?? "none"}
                      onValueChange={(v) =>
                        set("previewPresetId", v === "none" ? null : v)
                      }
                    >
                      <SelectTrigger>
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
                <Field label="Preview title">
                  <Input
                    value={cfg.metaTitle ?? ""}
                    onChange={(e) => set("metaTitle", e.target.value || null)}
                    placeholder="Shown when the link is shared"
                  />
                </Field>
                <Field label="Preview description">
                  <Textarea
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

              {target.type === "DATAROOM" && (
                <>
                  <Separator />
                  {groups.length > 0 && (
                    <Field
                      label="Audience group"
                      hint="Only group members can enter, and group permissions apply"
                    >
                      <Select
                        value={cfg.groupId ?? "none"}
                        onValueChange={(v) =>
                          set("groupId", v === "none" ? null : v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No group</SelectItem>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  <SwitchRow
                    title="Share entire data room"
                    caption="Turn off to choose exactly which files and folders this link can access"
                    checked={cfg.fullAccess}
                    onChange={(v) => set("fullAccess", v)}
                  />
                  {!cfg.fullAccess && (
                    <PermissionTree
                      tree={tree}
                      permissions={cfg.permissions}
                      allowDownload={cfg.allowDownload}
                      onChange={(perms) => set("permissions", perms)}
                    />
                  )}

                  <div className="space-y-3">
                    <SwitchRow
                      title="Index file"
                      caption="Offer a generated table of contents for download"
                      checked={cfg.enableIndexFile}
                      onChange={(v) => set("enableIndexFile", v)}
                    />
                    <SwitchRow
                      title="Q&A"
                      caption="Visitors can ask questions inside the data room"
                      checked={cfg.enableQA}
                      onChange={(v) => set("enableQA", v)}
                    />
                  </div>
                </>
              )}
            </div>

            <SheetFooter className="border-t">
              <Button onClick={submit} disabled={saving || !cfg.name.trim()}>
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
    <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{caption}</span>
      </span>
    </label>
  );
}

function SwitchRow({
  title,
  caption,
  checked,
  onChange,
}: {
  title: string;
  caption: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{caption}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
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
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md py-1 text-left">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {caption && (
            <div className="text-xs text-muted-foreground">{caption}</div>
          )}
        </div>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
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
            className="flex items-center gap-2 py-1.5"
            style={{ paddingLeft: depth * 16 }}
          >
            {item.kind === "folder" ? (
              <Folder className="size-4 text-[#b7791f]" strokeWidth={1.5} />
            ) : (
              <FileIcon type={item.docType ?? "OTHER"} />
            )}
            <span className="flex-1 truncate text-sm">{item.name}</span>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Checkbox
                checked={grant?.canView ?? false}
                onCheckedChange={(v) => toggle(item, "canView", v === true)}
              />
              view
            </label>
            <label
              className={cn(
                "flex items-center gap-1 text-xs text-muted-foreground",
                !allowDownload && "opacity-40"
              )}
            >
              <Checkbox
                disabled={!allowDownload}
                checked={grant?.canDownload ?? false}
                onCheckedChange={(v) =>
                  toggle(item, "canDownload", v === true)
                }
              />
              download
            </label>
          </div>
          {item.children && renderItems(item.children, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="rounded-md border px-3 py-2">
      <p className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Item permissions
      </p>
      {tree.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          This data room has no content yet.
        </p>
      ) : (
        renderItems(tree, 0)
      )}
    </div>
  );
}
