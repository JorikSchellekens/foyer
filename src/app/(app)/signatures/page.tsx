import Link from "next/link";
import { PenLine } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, timeAgo } from "@/lib/format";
import { StatusBadge } from "./status-badge";
import { SignatureUploadButton } from "./upload-button";

export const metadata = { title: "Signatures" };

export default async function SignaturesPage() {
  const ctx = await requireTeam();
  const requests = await db.signatureRequest.findMany({
    where: { teamId: ctx.team.id },
    include: {
      document: { select: { name: true } },
      signers: { orderBy: [{ order: "asc" }, { email: "asc" }] },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Signatures"
        description="Send documents for e-signature and track every envelope to completion."
      >
        <SignatureUploadButton />
      </PageHeader>
      <div className="px-4 sm:px-8 py-6">
        {requests.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title="No signature requests yet"
            description="Upload a document here to prepare and send it, or use &quot;Request signatures&quot; on anything already in your library."
          >
            <SignatureUploadButton />
          </EmptyState>
        ) : (
          <ul className="space-y-1">
            {requests.map((r, i) => {
              const signers = r.signers.filter((s) => s.role === "SIGNER");
              const signed = signers.filter((s) => s.status === "SIGNED").length;
              const when = r.sentAt ?? r.createdAt;
              return (
                <li
                  key={r.id}
                  className="stagger-item"
                  // Cap the cascade: a long list should not ripple for seconds.
                  style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
                >
                  <Link
                    href={`/signatures/${r.id}`}
                    className="group flex items-center gap-3 rounded-md border bg-card px-4 py-3 outline-none transition-[background-color,border-color,box-shadow] duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:border-primary/30 hover:bg-muted/50 focus-visible:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <PenLine
                      className="size-4 shrink-0 text-muted-foreground transition-colors duration-[var(--dur)] group-hover:text-primary"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      {/* Dot leader carries the eye from the envelope title to
                          its status, the way a book index does. */}
                      <div className="flex items-baseline">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {r.title}
                        </span>
                        <span className="leader-dots hidden sm:block" />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.document.name} ·{" "}
                        {signers.map((s) => s.email).join(", ") ||
                          "no recipients yet"}
                      </p>
                    </div>
                    {r.status === "SENT" && (
                      <Badge
                        variant="outline"
                        className="border-input font-mono text-muted-foreground tabular"
                      >
                        {signed}/{signers.length} signed
                      </Badge>
                    )}
                    <StatusBadge status={r.status} />
                    <time
                      dateTime={when.toISOString()}
                      title={formatDateTime(when)}
                      className="hidden w-24 shrink-0 text-right font-mono text-xs text-muted-foreground tabular sm:block"
                    >
                      {timeAgo(when)}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
