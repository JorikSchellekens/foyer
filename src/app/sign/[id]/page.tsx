import { headers } from "next/headers";
import { Download, CheckCircle2, Clock } from "lucide-react";
import { getSignerSession } from "@/lib/sign-session";
import { recordSignerView, signersUpNow, getFullRequest } from "@/lib/signing";
import { FoyerLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { SignerClient } from "./signer-client";
import type { FieldKind } from "@/lib/sign-fields";

export const metadata = { title: "Sign document" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <FoyerLogo size="md" />
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}

export default async function SignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSignerSession(id);
  if (!session)
    return (
      <Shell>
        <p className="font-display text-xl">This signing link is not active</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Open the link from your invitation email to continue.
        </p>
      </Shell>
    );

  const request = await getFullRequest(id);
  const signer = request?.signers.find((s) => s.id === session.signerId);
  if (!request || !signer)
    return (
      <Shell>
        <p className="font-display text-xl">This request is unavailable</p>
      </Shell>
    );

  const downloadButton = request.signedFileKey ? (
    <Button asChild className="mt-4">
      <a href={`/api/sign/completed/${request.id}?download=1`}>
        <Download className="size-4" /> Download signed document
      </a>
    </Button>
  ) : null;

  if (request.status === "COMPLETED")
    return (
      <Shell>
        <CheckCircle2 className="mx-auto size-8 text-primary" />
        <p className="mt-3 font-display text-xl">Everyone has signed</p>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong>{request.title}</strong> is fully executed, with a certificate
          of completion on the final page.
        </p>
        {downloadButton}
      </Shell>
    );

  if (request.status !== "SENT")
    return (
      <Shell>
        <p className="font-display text-xl">
          This request is {request.status.toLowerCase()}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          No further signatures are being collected on this document.
        </p>
      </Shell>
    );

  if (signer.role === "CC")
    return (
      <Shell>
        <p className="font-display text-xl">Nothing for you to sign</p>
        <p className="mt-2 text-sm text-muted-foreground">
          You are on copy for <strong>{request.title}</strong> and will receive
          the final document once everyone has signed.
        </p>
      </Shell>
    );

  if (signer.status === "SIGNED")
    return (
      <Shell>
        <CheckCircle2 className="mx-auto size-8 text-primary" />
        <p className="mt-3 font-display text-xl">You have signed</p>
        <p className="mt-2 text-sm text-muted-foreground">
          We will email you the final copy of <strong>{request.title}</strong>{" "}
          once all parties have signed.
        </p>
      </Shell>
    );

  if (signer.status === "DECLINED")
    return (
      <Shell>
        <p className="font-display text-xl">You declined to sign</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The sender has been notified.
        </p>
      </Shell>
    );

  // Sequential routing: a later-round signer who clicks early waits.
  if (!signersUpNow(request).some((s) => s.id === signer.id))
    return (
      <Shell>
        <Clock className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 font-display text-xl">It is not your turn yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong>{request.title}</strong> is being signed in order. We will
          email you when the signers before you have finished.
        </p>
      </Shell>
    );

  const h = await headers();
  await recordSignerView(
    signer.id,
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    h.get("user-agent")
  );

  const myFields = request.fields
    .filter((f) => f.signerId === signer.id)
    .map((f) => ({
      id: f.id,
      signerId: f.signerId,
      kind: f.kind as FieldKind,
      page: f.page,
      xPct: f.xPct,
      yPct: f.yPct,
      wPct: f.wPct,
      hPct: f.hPct,
      required: f.required,
    }));

  return (
    <SignerClient
      requestId={request.id}
      title={request.title}
      teamName={request.team.name}
      signerEmail={signer.email}
      signerName={signer.name}
      fileUrl={`/api/sign/file/${request.id}`}
      fields={myFields}
    />
  );
}
