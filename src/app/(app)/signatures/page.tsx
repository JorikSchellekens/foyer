import Link from "next/link";
import { PenLine } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
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
          <div className="space-y-1">
            {requests.map((r) => {
              const signers = r.signers.filter((s) => s.role === "SIGNER");
              const signed = signers.filter((s) => s.status === "SIGNED").length;
              return (
                <Link
                  key={r.id}
                  href={`/signatures/${r.id}`}
                  className="flex items-center gap-4 rounded-md border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <PenLine className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.document.name} ·{" "}
                      {signers.map((s) => s.email).join(", ") || "no recipients yet"}
                    </p>
                  </div>
                  {r.status === "SENT" && (
                    <Badge variant="secondary" className="font-mono">
                      {signed}/{signers.length} signed
                    </Badge>
                  )}
                  <StatusBadge status={r.status} />
                  <span className="hidden w-40 text-right font-mono text-xs text-muted-foreground sm:block">
                    {formatDateTime(r.sentAt ?? r.createdAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
