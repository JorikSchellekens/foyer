"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FolderMinus,
  Globe,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Stat } from "@/components/shell/stat";
import { pluralize } from "@/lib/format";
import {
  deleteImport,
  dismissImport,
  dissolveWrapperFolder,
  retryFailedItems,
} from "./actions";
import type { ActiveImport, ImportItemRow } from "./types";

/**
 * Step five: the receipt.
 *
 * Two jobs. First, make what just happened legible - counts by kind, every
 * failure with its reason, and the DNS cutover that still has to happen for
 * custom-domain links to resolve here. Second, make the whole thing go away
 * cleanly: tidy the wrapper folder, then dismiss or delete the record. Nothing
 * created by the import depends on the import record, so deleting it is free
 * of consequences - the content simply stays as ordinary Foyer content.
 */
export function Receipt({
  record,
  items,
  appHost,
}: {
  record: ActiveImport;
  items: ImportItemRow[];
  appHost: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const byKind = (kind: ImportItemRow["kind"]) =>
    items.filter((i) => i.kind === kind && i.status === "DONE").length;

  const failed = items.filter((i) => i.status === "FAILED");
  const skipped = items.filter((i) => i.status === "SKIPPED");

  const domains = items.filter((i) => i.kind === "DOMAIN" && i.status === "DONE");
  const preservedLinks =
    record.plan?.links.filter((l) => l.exactPreservable).length ?? 0;

  return (
    <div className="space-y-8">
      <section
        className={
          failed.length === 0
            ? "rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-5"
            : "rounded-lg border border-amber-500/40 bg-amber-500/5 p-5"
        }
      >
        <h2 className="flex items-center gap-2 font-display text-xl">
          {failed.length === 0 ? (
            <CheckCircle2 className="size-5 text-emerald-600" />
          ) : (
            <TriangleAlert className="size-5 text-amber-600" />
          )}
          {failed.length === 0
            ? "Migration complete"
            : "Migration finished with some failures"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything below is now ordinary Foyer content. Move it, rename it or
          reorganise it however you like - nothing here is special.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Documents" value={byKind("DOCUMENT")} />
        <Stat label="Datarooms" value={byKind("DATAROOM")} />
        <Stat label="Links" value={byKind("LINK")} />
        <Stat label="Visitors" value={byKind("VISITOR")} />
      </section>

      {/* ------------------------------------------------- domain cutover */}
      {domains.length > 0 && (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Globe className="size-4" /> One thing left: point your DNS here
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {pluralize(preservedLinks, "link")} kept{" "}
            {preservedLinks === 1 ? "its" : "their"} exact address. Those URLs
            still resolve to Papermark until you re-point the domain. When
            you are ready, create a CNAME for each domain below pointing at{" "}
            <code className="font-mono">{appHost}</code>, then verify it.
          </p>
          <ul className="mt-3 space-y-1.5">
            {domains.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono">{d.externalName}</span>
                <Badge variant="outline" className="ml-auto">
                  Awaiting DNS
                </Badge>
              </li>
            ))}
          </ul>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <Link href="/settings/domains">
              Manage domains <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      )}

      {/* -------------------------------------------------------- failures */}
      {failed.length > 0 && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <TriangleAlert className="size-4 text-amber-600" />
            {pluralize(failed.length, "item")} did not import
          </h2>
          <ul className="mt-3 space-y-1.5">
            {failed.slice(0, 20).map((f) => (
              <li key={f.id} className="rounded-md border bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {f.kind.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {f.externalName}
                  </span>
                </div>
                {f.error && (
                  <p className="mt-1 text-xs text-muted-foreground">{f.error}</p>
                )}
              </li>
            ))}
          </ul>
          {failed.length > 20 && (
            <p className="mt-2 text-xs text-muted-foreground">
              and {failed.length - 20} more
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { retried } = await retryFailedItems(record.id);
                toast.success(`Queued ${pluralize(retried, "item")} to retry.`);
                router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            <RotateCcw className="size-4" /> Retry these
          </Button>
        </section>
      )}

      {skipped.length > 0 && (
        <Collapsible className="rounded-lg border bg-card">
          <CollapsibleTrigger className="group flex w-full items-center gap-2 p-5 text-left text-sm font-medium">
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            {pluralize(skipped.length, "item")} skipped
          </CollapsibleTrigger>
          <CollapsibleContent className="px-5 pb-5">
            <ul className="space-y-1">
              {skipped.slice(0, 30).map((s) => (
                <li key={s.id} className="truncate text-xs text-muted-foreground">
                  {s.externalName}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* --------------------------------------------------------- tidy up */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-medium">Tidy up</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/documents">Review documents</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/links">Review links</Link>
          </Button>
          {record.rootFolderId && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await dissolveWrapperFolder(record.id);
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success("Folder dissolved; contents moved up.");
                    router.refresh();
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FolderMinus className="size-4" /> Dissolve the import folder
            </Button>
          )}
        </div>
        {record.rootFolderId && (
          <p className="mt-2 text-xs text-muted-foreground">
            Dissolving moves everything inside the import folder up into your
            library root and removes the empty folder.
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------- finish */}
      <section className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await dismissImport(record.id);
              toast.success("Import archived.");
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          Done - archive this record
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={busy}>
              <Trash2 className="size-4" /> Delete record
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete the import record?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the migration log and its list of what came from
                where. Every document, dataroom and link it created stays
                exactly as it is - they are normal Foyer content and do not
                depend on this record.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await deleteImport(record.id);
                  toast.success("Import record deleted.");
                  router.refresh();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <p className="text-xs text-muted-foreground">
          Archiving keeps the record available but out of the way.
        </p>
      </section>
    </div>
  );
}
