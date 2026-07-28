"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  FileText,
  FolderTree,
  Globe,
  Link2,
  Lock,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Stat } from "@/components/shell/stat";
import { formatBytes, pluralize } from "@/lib/format";
import type { ImportOptions } from "@/lib/papermark/run";
import type { ImportPlan } from "@/lib/papermark/scan";
import { confirmImport } from "./actions";
import type { ExistingDomain } from "./types";

/**
 * Step three: review and confirm.
 *
 * The point of this screen is that nothing about the import should be a
 * surprise. It states the totals, spells out every conversion that loses
 * information, and refuses to silently weaken a link: a password-protected
 * Papermark link cannot be recreated (the API never returns the password), so
 * either the user sets a new one here or that link is left behind.
 */
export function Review({
  importId,
  plan,
  hasCookie,
  existingDomains,
}: {
  importId: string;
  plan: ImportPlan;
  hasCookie: boolean;
  existingDomains: ExistingDomain[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [includeDatarooms, setIncludeDatarooms] = useState(true);
  const [includeLinks, setIncludeLinks] = useState(true);
  const [includeVisitors, setIncludeVisitors] = useState(plan.visitors.length > 0);

  const [placement, setPlacement] = useState<"wrap" | "merge">("wrap");
  const [wrapFolderName, setWrapFolderName] = useState("Papermark import");
  const [fileStrategy, setFileStrategy] = useState<"session" | "manual">(
    hasCookie ? "session" : "manual"
  );

  // Links that had a password. Each needs a new one or it gets skipped -
  // importing it unprotected would quietly publish something that was private.
  const passwordLinks = useMemo(
    () => plan.links.filter((l) => l.caveats.some((c) => c.code === "password")),
    [plan.links]
  );
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [skipLinkIds, setSkipLinkIds] = useState<string[]>([]);

  const brokenLinks = useMemo(
    () => plan.links.filter((l) => l.isArchivedTarget),
    [plan.links]
  );
  const agreementLinks = useMemo(
    () => plan.links.filter((l) => l.caveats.some((c) => c.code === "agreement")),
    [plan.links]
  );

  const preservable = plan.links.filter((l) => l.exactPreservable);
  const notPreservable = plan.links.filter(
    (l) => !l.exactPreservable && !l.isArchivedTarget
  );

  const unresolvedPasswords = passwordLinks.filter(
    (l) => !passwords[l.id]?.trim() && !skipLinkIds.includes(l.id)
  );

  const lossy = useMemo(() => {
    const groups = new Map<string, { message: string; count: number }>();
    for (const l of plan.links) {
      for (const c of l.caveats) {
        if (c.severity === "blocking") continue;
        const g = groups.get(c.code);
        if (g) g.count++;
        else groups.set(c.code, { message: c.message, count: 1 });
      }
    }
    return [...groups.values()];
  }, [plan.links]);

  async function start() {
    if (includeLinks && unresolvedPasswords.length > 0) {
      toast.error(
        "Set a new password for each protected link, or choose to leave it behind."
      );
      return;
    }
    setBusy(true);
    try {
      const options: ImportOptions = {
        include: {
          documents: includeDocuments,
          datarooms: includeDatarooms,
          links: includeLinks,
          visitors: includeVisitors,
        },
        placement,
        wrapFolderName,
        fileStrategy,
        linkPasswords: Object.fromEntries(
          Object.entries(passwords).filter(([, v]) => v.trim())
        ),
        skipLinkIds: [
          ...skipLinkIds,
          ...brokenLinks.map((l) => l.id),
          ...(includeLinks ? [] : plan.links.map((l) => l.id)),
        ],
      };
      const res = await confirmImport(importId, options);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ---------------------------------------------------------- totals */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Documents"
          value={plan.documents.length}
          hint={
            plan.totalBytes > 0
              ? `${formatBytes(plan.totalBytes)} of files`
              : undefined
          }
        />
        <Stat
          label="Datarooms"
          value={plan.datarooms.length}
          hint={`${pluralize(
            plan.datarooms.reduce((n, d) => n + d.documents.length, 0),
            "placement"
          )}`}
        />
        <Stat
          label="Links"
          value={plan.links.length}
          hint={`${preservable.length} keep their exact URL`}
        />
        <Stat label="Custom domains" value={plan.domains.length} />
      </section>

      {/* ------------------------------------------------------- attention */}
      {(unresolvedPasswords.length > 0 ||
        brokenLinks.length > 0 ||
        agreementLinks.length > 0) && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <AlertTriangle className="size-4 text-amber-600" />
            Needs a decision
          </h2>

          {passwordLinks.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">
                {pluralize(passwordLinks.length, "link")} used a password.
                Papermark never returns passwords, so importing one as-is would
                make it less protected than it is today. Set a new password, or
                leave the link behind.
              </p>
              <ul className="mt-3 space-y-2">
                {passwordLinks.map((l) => {
                  const skipped = skipLinkIds.includes(l.id);
                  return (
                    <li
                      key={l.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2"
                    >
                      <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {l.name}
                      </span>
                      <Input
                        type="password"
                        className="h-8 w-44"
                        placeholder="New password"
                        disabled={skipped}
                        value={passwords[l.id] ?? ""}
                        onChange={(e) =>
                          setPasswords((p) => ({ ...p, [l.id]: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant={skipped ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() =>
                          setSkipLinkIds((s) =>
                            skipped ? s.filter((x) => x !== l.id) : [...s, l.id]
                          )
                        }
                      >
                        {skipped ? "Leaving behind" : "Leave behind"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {agreementLinks.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">
                {pluralize(agreementLinks.length, "link")} required an NDA.
              </strong>{" "}
              Papermark&rsquo;s API does not expose agreement documents. These
              links import without the NDA gate - recreate the agreement under
              Settings &rarr; Agreements and attach it before sharing again.
            </p>
          )}

          {brokenLinks.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">
                {pluralize(brokenLinks.length, "link")}{" "}
                {brokenLinks.length === 1 ? "points" : "point"} at something this
                token cannot see
              </strong>{" "}
              (deleted, or outside its scope).{" "}
              {brokenLinks.length === 1 ? "It" : "They"} will be skipped.
            </p>
          )}
        </section>
      )}

      {/* ---------------------------------------------------------- files */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <FileText className="size-4" /> How the files get here
        </h2>
        <RadioGroup
          className="mt-3 gap-3"
          value={fileStrategy}
          onValueChange={(v) => setFileStrategy(v as "session" | "manual")}
        >
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
              !hasCookie ? "opacity-50" : ""
            }`}
          >
            <RadioGroupItem value="session" disabled={!hasCookie} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium">Fetch them automatically</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {hasCookie
                  ? "Uses the session cookie you provided to pull the original file for each document. Nothing is recorded against your Papermark analytics."
                  : "Unavailable - no session cookie was provided. Reconnect with one to enable this."}
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
            <RadioGroupItem value="manual" className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium">I&rsquo;ll upload them myself</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Everything else imports first. At the end you drop in the files
                you downloaded from Papermark and Foyer matches them to the{" "}
                {pluralize(plan.fileCount, "document")} by name.
              </span>
            </span>
          </label>
        </RadioGroup>
      </section>

      {/* ------------------------------------------------------ what & where */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <FolderTree className="size-4" /> What comes over, and where it lands
        </h2>

        <div className="mt-3 space-y-2">
          <Row
            checked={includeDocuments}
            onChange={setIncludeDocuments}
            icon={<FileText className="size-3.5" />}
            label={`${pluralize(plan.documents.length, "document")} in ${pluralize(
              plan.folders.length,
              "folder"
            )}`}
          />
          <Row
            checked={includeDatarooms}
            onChange={setIncludeDatarooms}
            icon={<FolderTree className="size-3.5" />}
            label={pluralize(plan.datarooms.length, "dataroom")}
            hint="Folder structure and document order are preserved."
          />
          <Row
            checked={includeLinks}
            onChange={setIncludeLinks}
            icon={<Link2 className="size-3.5" />}
            label={pluralize(plan.links.length, "link")}
            hint="Access mode, expiry, allow and block lists, download and watermark settings."
          />
          <Row
            checked={includeVisitors}
            onChange={setIncludeVisitors}
            icon={<Users className="size-3.5" />}
            label={pluralize(plan.visitors.length, "known visitor")}
            hint="Email identities only. Papermark's historic view analytics stay in Papermark."
          />
        </div>

        {includeDocuments && (
          <div className="mt-5 border-t pt-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Library placement
            </Label>
            <RadioGroup
              className="mt-2 gap-2"
              value={placement}
              onValueChange={(v) => setPlacement(v as "wrap" | "merge")}
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="wrap" className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium">Inside one folder</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Everything lands in a single folder so it is easy to find,
                    review and move. You can dissolve the folder in one click
                    afterwards.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="merge" className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-medium">Straight into the library</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Recreates Papermark&rsquo;s folder tree at the top level of
                    your library, merging with folders of the same name.
                  </span>
                </span>
              </label>
            </RadioGroup>
            {placement === "wrap" && (
              <Input
                className="mt-2 max-w-xs"
                value={wrapFolderName}
                onChange={(e) => setWrapFolderName(e.target.value)}
                placeholder="Folder name"
              />
            )}
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- link URLs */}
      {includeLinks && plan.links.length > 0 && (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Globe className="size-4" /> Link addresses
          </h2>

          {plan.domains.length > 0 ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                {pluralize(preservable.length, "link")} on{" "}
                {pluralize(plan.domains.length, "custom domain")} will keep the
                exact same address. Foyer registers each domain now; you point
                DNS at Foyer when you are ready to cut over, and the URLs keep
                working without anyone needing a new link.
              </p>
              <ul className="mt-3 space-y-1.5">
                {plan.domains.map((d) => {
                  const already = existingDomains.find(
                    (e) => e.domain === d.domain
                  );
                  return (
                    <li
                      key={d.domain}
                      className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-mono">{d.domain}</span>
                      <span className="text-xs text-muted-foreground">
                        {pluralize(d.linkCount, "link")}
                      </span>
                      {already ? (
                        <Badge variant="secondary" className="ml-auto">
                          {already.status === "VERIFIED"
                            ? "Already verified"
                            : "Already added"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="ml-auto">
                          Will be added
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              None of your links use a custom domain.
            </p>
          )}

          {notPreservable.length > 0 && (
            <div className="mt-4 rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <strong className="font-medium text-foreground">
                  {pluralize(notPreservable.length, "link")}{" "}
                  {notPreservable.length === 1 ? "sits" : "sit"} on papermark.com
                </strong>{" "}
                and cannot keep its address - that domain is not yours to serve.
                Each one is recreated here with the same path, so{" "}
                <code className="font-mono text-[11px]">
                  papermark.com/view/abc123
                </code>{" "}
                becomes{" "}
                <code className="font-mono text-[11px]">
                  your-foyer/view/abc123
                </code>
                . Anyone holding an old link needs the new one.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ---------------------------------------------------- lossy details */}
      {lossy.length > 0 && (
        <Collapsible className="rounded-lg border bg-card">
          <CollapsibleTrigger className="group flex w-full items-center gap-2 p-5 text-left text-sm font-medium">
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            {pluralize(lossy.length, "setting")} will not carry over exactly
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 px-5 pb-5">
            {lossy.map((c, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                <Badge variant="secondary" className="mr-2">
                  {c.count}
                </Badge>
                {c.message}
              </p>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button onClick={start} disabled={busy}>
          {busy ? "Starting..." : "Start import"}
          <ArrowRight className="size-4" />
        </Button>
        <p className="text-xs text-muted-foreground">
          Nothing in Papermark is modified. You can pause at any point.
        </p>
      </div>
    </div>
  );
}

function Row({
  checked,
  onChange,
  icon,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <span className="min-w-0 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          {icon}
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
