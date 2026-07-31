"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PackageOpen, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/shell/empty-state";
import { timeAgo } from "@/lib/format";
import { ConnectForm } from "./connect-form";
import { ManualFiles } from "./manual-files";
import { Receipt } from "./receipt";
import { Review } from "./review";
import { RunProgress } from "./run-progress";
import {
  deleteImport,
  getImportStatus,
  startScan,
} from "./actions";
import type { ActiveImport, ExistingDomain, ImportItemRow } from "./types";

/**
 * Phase router for the migration.
 *
 * The Import row's status is the single source of truth for which step is on
 * screen, so a refresh, a new tab or a different admin all land in the same
 * place - there is no wizard state living only in this component.
 */
export function ImportClient({
  canManage,
  active,
  items,
  past,
  existingDomains,
  appHost,
}: {
  canManage: boolean;
  active: ActiveImport | null | undefined;
  items: ImportItemRow[];
  past: { id: string; createdAt: string; done: number; failed: number }[];
  existingDomains: ExistingDomain[];
  appHost: string;
}) {
  if (!canManage) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="Importing needs admin access"
        description="Ask an owner or admin of this team to run the migration."
      />
    );
  }

  if (!active) {
    return (
      <div className="space-y-8">
        <Intro />
        <ConnectForm />
        {past.length > 0 && <PastRuns past={past} />}
      </div>
    );
  }

  switch (active.status) {
    case "DRAFT":
      return <DraftPhase record={active} />;
    case "SCANNING":
      return <ScanningPhase record={active} />;
    case "READY":
      return active.plan ? (
        <Review
          importId={active.id}
          plan={active.plan}
          hasCookie={active.hasCookie}
          existingDomains={existingDomains}
        />
      ) : (
        <ScanningPhase record={active} />
      );
    case "RUNNING":
    case "PAUSED":
      return (
        <div className="space-y-6">
          <RunProgress record={active} />
          {active.options?.fileStrategy === "manual" && (
            <ManualFiles
              importId={active.id}
              pendingDocuments={pendingManualDocuments(active, items)}
            />
          )}
        </div>
      );
    case "COMPLETED":
      return (
        <div className="space-y-6">
          {active.options?.fileStrategy === "manual" &&
            pendingManualDocuments(active, items).length > 0 && (
              <ManualFiles
                importId={active.id}
                pendingDocuments={pendingManualDocuments(active, items)}
              />
            )}
          <Receipt record={active} items={items} appHost={appHost} />
        </div>
      );
    case "FAILED":
      return <FailedPhase record={active} />;
    default:
      return null;
  }
}

/** Documents in the plan that still have no file attached. */
function pendingManualDocuments(
  record: ActiveImport,
  items: ImportItemRow[]
): { id: string; name: string }[] {
  const plan = record.plan;
  if (!plan) return [];
  const attached = record.options?.manualFiles ?? {};
  const doneIds = new Set(
    items.filter((i) => i.kind === "DOCUMENT" && i.status === "DONE").map((i) => i.externalId)
  );
  return plan.documents
    .filter((d) => !d.external && !attached[d.id] && !doneIds.has(d.id))
    .map((d) => ({ id: d.id, name: d.fileName }));
}

function Intro() {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl">Move in from Papermark</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Brings your documents, folders, datarooms, links and their settings
        across, keeping folder structure and document order intact. Links on a
        custom domain keep their exact address, so nothing you have already
        shared has to be re-sent.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing in Papermark is changed or deleted. You will see a full summary
        of what will happen before anything is created here.
      </p>
    </div>
  );
}

function DraftPhase({ record }: { record: ActiveImport }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-medium">Connected to Papermark</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Next, Foyer reads your account to work out exactly what would come
          over. This only reads - nothing is created yet, in either product.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Papermark limits how fast its API can be read, so a large account can
          take a few minutes.
        </p>
        <Button
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await startScan(record.id);
              if (!res.ok) toast.error(res.error);
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Starting..." : "Scan my Papermark account"}
        </Button>
      </div>
      <CancelButton importId={record.id} />
    </div>
  );
}

function ScanningPhase({ record }: { record: ActiveImport }) {
  const router = useRouter();
  const [activity, setActivity] = useState(record.activity);

  // The scan runs detached from any request, so poll for its progress.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await getImportStatus(record.id);
        if (!alive) return;
        setActivity(s.activity);
        if (s.status !== "SCANNING") router.refresh();
      } catch {
        /* transient */
      }
    };
    const handle = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(handle);
    };
  }, [record.id, router]);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin" />
          Reading your Papermark account
        </h2>
        <p className="mt-2 min-h-4 text-xs text-muted-foreground">
          {activity ?? "Starting..."}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          You can leave this page; the scan carries on. Come back here to see
          the result.
        </p>
      </div>
      <CancelButton importId={record.id} />
    </div>
  );
}

function FailedPhase({ record }: { record: ActiveImport }) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-5">
      <Alert variant="destructive">
        <AlertDescription>
          {record.error ?? "The import could not continue."}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            const res = await startScan(record.id);
            if (!res.ok) toast.error(res.error);
            router.refresh();
          }}
        >
          <RotateCcw className="size-4" /> Scan again
        </Button>
        <CancelButton importId={record.id} />
      </div>
    </div>
  );
}

function CancelButton({ importId }: { importId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await deleteImport(importId);
        toast.success("Import cancelled.");
        router.refresh();
      }}
    >
      <Trash2 className="size-4" /> Cancel and start over
    </Button>
  );
}

function PastRuns({
  past,
}: {
  past: { id: string; createdAt: string; done: number; failed: number }[];
}) {
  return (
    <section className="max-w-2xl">
      <h3 className="text-sm font-medium">Earlier migrations</h3>
      <ul className="mt-2 space-y-1.5">
        {past.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground" suppressHydrationWarning>
              {timeAgo(p.createdAt)}
            </span>
            <span className="ml-auto font-mono text-xs tabular text-muted-foreground">
              {p.done} imported
              {p.failed > 0 ? `, ${p.failed} failed` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
