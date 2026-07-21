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

export function AccessRequests({ requests }: { requests: AccessRequestRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(requests);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (rows.length === 0) return null;

  async function act(id: string, kind: "grant" | "dismiss") {
    setBusyId(id);
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
      setRows((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-lg border border-primary/30 bg-primary/[0.03] p-5">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <h2 className="text-sm font-medium">Access requests</h2>
        <span className="text-xs text-muted-foreground">
          · {rows.length} pending
        </span>
      </div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
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
              disabled={busyId === r.id}
              onClick={() => act(r.id, "dismiss")}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              <X className="size-3.5" /> Dismiss
            </button>
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => act(r.id, "grant")}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busyId === r.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Grant
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
