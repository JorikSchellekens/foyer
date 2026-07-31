import { Clock, Download, FileText, PenLine } from "lucide-react";
import { db } from "@/lib/db";
import { getPortalEmail } from "@/lib/sign-session";
import { FoyerLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/app/(app)/signatures/status-badge";
import { formatDateTime } from "@/lib/format";
import { PortalEmailForm, DifferentEmailButton } from "./portal-form";

export const metadata = { title: "Your signed documents" };

export default async function SignedPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  const email = await getPortalEmail();

  if (!email) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-6">
        <div className="reveal">
          <FoyerLogo size="md" />
        </div>
        <div className="reveal-up w-full max-w-md rounded-xl border bg-card p-8 shadow-[var(--shadow-raise)]">
          <h1 className="font-display text-xl">Your signed documents</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Enter the email address you signed with and we will send you a
            secure link - no account or password needed.
          </p>
          {expired && (
            <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              That link has expired or was already used. Request a fresh one.
            </p>
          )}
          <PortalEmailForm />
        </div>
        <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
          Links are single use and expire after 30 minutes. We never reveal
          whether an address has documents.
        </p>
      </div>
    );
  }

  const signings = await db.signer.findMany({
    where: { email },
    include: {
      request: {
        include: { team: { select: { name: true } } },
      },
    },
    orderBy: { request: { updatedAt: "desc" } },
  });
  // Drafts are the sender's business; everything sent onward is the signer's.
  const rows = signings.filter((s) => s.request.status !== "DRAFT");

  const awaiting = rows.filter(
    (s) =>
      s.request.status === "SENT" &&
      s.role === "SIGNER" &&
      s.status !== "SIGNED" &&
      s.status !== "DECLINED"
  ).length;

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <FoyerLogo size="md" />
          <div className="min-w-0 text-right">
            <p className="truncate text-sm">{email}</p>
            <DifferentEmailButton />
          </div>
        </div>
        <h1 className="reveal font-display text-2xl">Your documents</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Everything sent to this email for signature, across every sender on
          this platform.
        </p>
        {awaiting > 0 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-1.5 text-sm text-primary">
            <Clock className="size-3.5" aria-hidden />
            {awaiting === 1
              ? "1 document is waiting for your signature"
              : `${awaiting} documents are waiting for your signature`}
          </p>
        )}
        <div className="mt-6 space-y-2">
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed bg-card px-8 py-12 text-center">
              <FileText
                className="mx-auto size-6 text-muted-foreground/60"
                aria-hidden
              />
              <p className="mt-3 text-sm font-medium">Nothing here yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                When someone sends you a document to sign, it will appear in
                this list.
              </p>
            </div>
          )}
          {rows.map((s, i) => {
            const r = s.request;
            const canDownload = r.status === "COMPLETED" && r.signedFileKey;
            const canSign =
              r.status === "SENT" &&
              s.role === "SIGNER" &&
              s.status !== "SIGNED" &&
              s.status !== "DECLINED";
            return (
              <div
                key={s.id}
                className="stagger-item hover-raise flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card px-4 py-3 hover:border-foreground/15"
                style={{ "--i": i } as React.CSSProperties}
              >
                <PenLine
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    from {r.team.name}
                    {r.completedAt
                      ? ` · completed ${formatDateTime(r.completedAt)}`
                      : r.sentAt
                        ? ` · sent ${formatDateTime(r.sentAt)}`
                        : ""}
                  </p>
                </div>
                <StatusBadge status={r.status} />
                {canDownload && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/sign/completed/${r.id}?download=1`}>
                      <Download className="size-3.5" /> Download
                    </a>
                  </Button>
                )}
                {canSign && (
                  <Button asChild size="sm">
                    <a href={`/sign/t/${s.token}`}>Review &amp; sign</a>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
          This list is tied to {email}. Signed copies stay available here for as
          long as the sender keeps them.
        </p>
      </div>
    </div>
  );
}
