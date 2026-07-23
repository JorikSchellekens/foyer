import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, FileText } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { FieldEditor } from "@/components/signing/field-editor";
import { StatusBadge } from "../status-badge";
import { StatusActions } from "./status-actions";
import type { FieldKind } from "@/lib/sign-fields";

export default async function SignatureRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTeam();
  const { id } = await params;
  const request = await db.signatureRequest.findFirst({
    where: { id, teamId: ctx.team.id },
    include: {
      document: true,
      version: true,
      signers: { orderBy: [{ order: "asc" }, { email: "asc" }] },
      fields: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!request) notFound();

  if (request.status === "DRAFT") {
    return (
      <FieldEditor
        requestId={request.id}
        fileUrl={`/api/documents/file/${request.versionId}`}
        initialTitle={request.title}
        initialMessage={request.message}
        initialSequential={request.sequential}
        initialSigners={request.signers.map((s) => ({
          id: s.id,
          email: s.email,
          name: s.name,
          role: s.role,
          order: s.order,
        }))}
        initialFields={request.fields.map((f) => ({
          id: f.id,
          signerId: f.signerId,
          kind: f.kind as FieldKind,
          page: f.page,
          xPct: f.xPct,
          yPct: f.yPct,
          wPct: f.wPct,
          hPct: f.hPct,
          required: f.required,
        }))}
      />
    );
  }

  const signerById = new Map(request.signers.map((s) => [s.id, s]));
  const signers = request.signers.filter((s) => s.role === "SIGNER");

  return (
    <div>
      <div className="border-b px-4 sm:px-8 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link href="/signatures" className="hover:text-foreground">
                Signatures
              </Link>
              <ChevronRight className="size-3" />
              <span>{request.title}</span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-display text-2xl">{request.title}</h1>
              <StatusBadge status={request.status} />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="size-3.5" />
              <Link
                href={`/documents/${request.documentId}`}
                className="hover:text-foreground"
              >
                {request.document.name}
              </Link>
              {request.sentAt && ` · sent ${formatDateTime(request.sentAt)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {request.status === "COMPLETED" && request.signedFileKey && (
              <Button asChild>
                <a href={`/api/sign/completed/${request.id}?download=1`}>
                  <Download className="size-4" /> Signed document
                </a>
              </Button>
            )}
            <StatusActions requestId={request.id} status={request.status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 px-4 py-6 sm:px-8 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 font-display text-xl">Recipients</h2>
          <div className="space-y-3">
            {signers.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{s.name ?? s.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.email}
                    {s.signedAt
                      ? ` · signed ${formatDateTime(s.signedAt)}`
                      : s.viewedAt
                        ? ` · viewed ${formatDateTime(s.viewedAt)}`
                        : s.lastSentAt
                          ? ` · invited ${formatDateTime(s.lastSentAt)}`
                          : " · waiting for their turn"}
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
            {request.signers
              .filter((s) => s.role === "CC")
              .map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{s.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Receives the final copy
                    </p>
                  </div>
                </div>
              ))}
          </div>
          {request.voidReason && (
            <p className="mt-4 text-sm text-muted-foreground">
              Voided: {request.voidReason}
            </p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 font-display text-xl">Activity</h2>
          <div className="space-y-2">
            {request.events.map((e) => (
              <div key={e.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                  {formatDateTime(e.createdAt)}
                </span>
                <span className="capitalize">{e.type}</span>
                <span className="truncate text-muted-foreground">
                  {e.signerId ? signerById.get(e.signerId)?.email : ""}
                </span>
              </div>
            ))}
          </div>
          {request.finalHash && (
            <p className="mt-4 break-all font-mono text-xs text-muted-foreground">
              SHA-256 {request.finalHash}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
