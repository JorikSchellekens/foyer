"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  grantAccessRequest,
  dismissAccessRequest,
} from "@/app/(app)/links/actions";

export type AccessRequestRow = {
  id: string;
  email: string;
  note: string | null;
  linkName: string;
  createdAt: string;
};

type Busy = { id: string; kind: "grant" | "dismiss" };

export function AccessRequests({ requests }: { requests: AccessRequestRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(requests);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [settled, setSettled] = useState<string | null>(null);

  if (rows.length === 0) return null;

  async function act(id: string, kind: "grant" | "dismiss") {
    setBusy({ id, kind });
    try {
      if (kind === "grant") {
        const res = await grantAccessRequest(id);
        if (res && "error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Access granted");
      } else {
        await dismissAccessRequest(id);
        toast.success("Request dismissed");
      }
      // Let the row fade before it leaves, so the decision has a visible end.
      setSettled(id);
      setTimeout(() => {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setSettled(null);
        router.refresh();
      }, 180);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="reveal rounded-lg border border-primary/30 bg-primary/[0.03] p-5">
      <div className="mb-4 flex items-baseline gap-2">
        <KeyRound className="size-4 translate-y-0.5 text-primary" aria-hidden />
        <h2 className="font-display text-xl">Access requests</h2>
        <span className="font-mono text-xs tabular text-muted-foreground">
          {rows.length} pending
        </span>
      </div>
      <ul className="divide-y">
        {rows.map((r) => {
          const rowBusy = busy?.id === r.id;
          return (
            <li
              key={r.id}
              data-settled={settled === r.id}
              className="flex items-center gap-3 py-2.5 transition-opacity duration-[var(--dur)] ease-[var(--ease-out-soft)] first:pt-0 last:pb-0 data-[settled=true]:opacity-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.linkName}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={rowBusy}
                onClick={() => act(r.id, "dismiss")}
                aria-label={`Dismiss the request from ${r.email}`}
                className="press focus-ring inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {rowBusy && busy?.kind === "dismiss" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <X className="size-3.5" aria-hidden />
                )}
                Dismiss
              </button>
              <button
                type="button"
                disabled={rowBusy}
                onClick={() => act(r.id, "grant")}
                aria-label={`Grant access to ${r.email}`}
                className="press focus-ring inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-[var(--shadow-raise)] transition-opacity duration-[var(--dur-fast)] hover:opacity-90 disabled:opacity-50"
              >
                {rowBusy && busy?.kind === "grant" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="size-3.5" aria-hidden />
                )}
                Grant
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
