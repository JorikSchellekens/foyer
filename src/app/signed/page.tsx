import { Download, PenLine } from "lucide-react";
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
        <FoyerLogo size="md" />
        <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
          <h1 className="font-display text-xl">Your signed documents</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the email address you signed with and we will send you a
            secure link - no account or password needed.
          </p>
          {expired && (
            <p className="mt-2 text-sm text-destructive">
              That link has expired or was already used. Request a fresh one.
            </p>
          )}
          <PortalEmailForm />
        </div>
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

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <FoyerLogo size="md" />
          <div className="text-right">
            <p className="text-sm">{email}</p>
            <DifferentEmailButton />
          </div>
        </div>
        <h1 className="font-display text-2xl">Your documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything sent to this email for signature, across every sender on
          this platform.
        </p>
        <div className="mt-6 space-y-2">
          {rows.length === 0 && (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              Nothing here yet. When someone sends you a document to sign, it
              will appear in this list.
            </div>
          )}
          {rows.map((s) => {
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
                className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3"
              >
                <PenLine className="size-4 shrink-0 text-muted-foreground" />
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
      </div>
    </div>
  );
}
