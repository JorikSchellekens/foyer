"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lock, MailCheck, ShieldX, TimerOff, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "./signature-pad";
import { FoyerMark } from "@/components/brand/logo";
import {
  submitPassword,
  submitEmail,
  signAgreement,
} from "@/app/view/actions";

export type GateBrand = {
  teamName: string;
  itemName: string;
  brandColor: string;
  backgroundColor: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  welcomeMessage: string | null;
};

function contrastText(hex: string): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#16181d" : "#ffffff";
}

export function GateShell({
  brand,
  children,
}: {
  brand: GateBrand;
  children: React.ReactNode;
}) {
  const textColor = contrastText(brand.backgroundColor);
  return (
    <main
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: brand.backgroundColor, color: textColor }}
    >
      {brand.bannerUrl && (
        <div className="h-40 w-full overflow-hidden sm:h-52">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.bannerUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-start gap-4">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt={brand.teamName}
                className="h-10 w-auto max-w-40 object-contain"
              />
            ) : (
              <span
                className="flex size-10 items-center justify-center rounded-md font-mono text-lg font-bold"
                style={{
                  backgroundColor: brand.brandColor,
                  color: contrastText(brand.brandColor),
                }}
              >
                {brand.teamName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-sm opacity-60">{brand.teamName} shared</p>
              <h1 className="font-display text-3xl leading-tight tracking-tight">
                {brand.itemName}
              </h1>
            </div>
            {brand.welcomeMessage && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed opacity-80">
                {brand.welcomeMessage}
              </p>
            )}
          </div>
          {children}
        </div>
      </div>
      <footer className="flex items-center justify-center gap-1.5 pb-6 text-xs opacity-40">
        <FoyerMark className="size-3" />
        Secured by Foyer
      </footer>
    </main>
  );
}

const cardClass =
  "rounded-lg bg-white p-6 text-neutral-900 shadow-2xl dark:shadow-none";

export function PasswordGate({
  slug,
  brand,
}: {
  slug: string;
  brand: GateBrand;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <div className="mb-4 flex items-center gap-2 text-sm font-medium">
          <Lock className="size-4" style={{ color: brand.brandColor }} />
          This link is password protected
        </div>
        <form
          className="space-y-3"
          action={async () => {
            setBusy(true);
            try {
              const res = await submitPassword(slug, password);
              if (res && "error" in res && res.error) toast.error(res.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            required
            className="bg-white"
          />
          <Button
            type="submit"
            className="w-full text-white"
            style={{ backgroundColor: brand.brandColor }}
            disabled={busy || !password}
          >
            {busy ? "Checking…" : "Continue"}
          </Button>
        </form>
      </div>
    </GateShell>
  );
}

export function EmailGate({
  slug,
  brand,
  requireVerification,
}: {
  slug: string;
  brand: GateBrand;
  requireVerification: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent)
    return <VerifySentGate brand={brand} email={email} />;

  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <p className="mb-4 text-sm font-medium">
          {requireVerification
            ? "Verify your email to view"
            : "Enter your email to view"}
        </p>
        <form
          className="space-y-3"
          action={async () => {
            setBusy(true);
            try {
              const res = await submitEmail(slug, email);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              if (res && "pendingVerification" in res && res.pendingVerification)
                setSent(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="gate-email" className="text-neutral-700">
              Work email
            </Label>
            <Input
              id="gate-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              required
              className="bg-white"
            />
          </div>
          <Button
            type="submit"
            className="w-full text-white"
            style={{ backgroundColor: brand.brandColor }}
            disabled={busy || !email.includes("@")}
          >
            {busy
              ? "One moment…"
              : requireVerification
                ? "Send verification link"
                : "View document"}
          </Button>
          <p className="text-xs text-neutral-500">
            The document owner will see your email and viewing activity.
          </p>
        </form>
      </div>
    </GateShell>
  );
}

export function VerifySentGate({
  brand,
  email,
}: {
  brand: GateBrand;
  email?: string;
}) {
  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <div className="flex items-start gap-3">
          <MailCheck
            className="mt-0.5 size-5 shrink-0"
            style={{ color: brand.brandColor }}
          />
          <div>
            <p className="text-sm font-medium">Check your inbox</p>
            <p className="mt-1 text-sm text-neutral-600">
              We sent a verification link{email ? ` to ${email}` : ""}. Open it
              on this device to continue to the document.
            </p>
          </div>
        </div>
      </div>
    </GateShell>
  );
}

export function AgreementGate({
  slug,
  brand,
  agreement,
}: {
  slug: string;
  brand: GateBrand;
  agreement: {
    name: string;
    type: "EMBEDDED" | "LINK" | "TEXT";
    requireName: boolean;
    content: string | null;
    externalUrl: string | null;
    fileUrl: string | null;
  };
}) {
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    (!agreement.requireName || name.trim().length > 1) &&
    (agreement.type !== "EMBEDDED" || !!signature);

  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <div className="mb-4 flex items-center gap-2 text-sm font-medium">
          <FileSignature
            className="size-4"
            style={{ color: brand.brandColor }}
          />
          {agreement.name}
        </div>

        {agreement.type === "TEXT" && agreement.content && (
          <div className="mb-4 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700">
            {agreement.content}
          </div>
        )}
        {agreement.type === "LINK" && agreement.externalUrl && (
          <p className="mb-4 text-sm text-neutral-600">
            Review the agreement:{" "}
            <a
              href={agreement.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
              style={{ color: brand.brandColor }}
            >
              open document
            </a>
          </p>
        )}
        {agreement.type === "EMBEDDED" && agreement.fileUrl && (
          <div className="mb-4 h-72 overflow-hidden rounded-md border">
            <iframe
              src={`${agreement.fileUrl}#toolbar=0`}
              title={agreement.name}
              className="h-full w-full"
            />
          </div>
        )}

        <form
          className="space-y-3"
          action={async () => {
            setBusy(true);
            try {
              const res = await signAgreement(slug, {
                name: name || undefined,
                signatureData: signature ?? undefined,
              });
              if (res && "error" in res && res.error) toast.error(res.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {agreement.requireName && (
            <div className="space-y-1.5">
              <Label htmlFor="sig-name" className="text-neutral-700">
                Full legal name
              </Label>
              <Input
                id="sig-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Appleseed"
                required
                className="bg-white"
              />
            </div>
          )}
          {agreement.type === "EMBEDDED" && (
            <SignaturePad onChange={setSignature} />
          )}
          <Button
            type="submit"
            className="w-full text-white"
            style={{ backgroundColor: brand.brandColor }}
            disabled={!canSubmit || busy}
          >
            {busy ? "Recording signature…" : "Agree and continue"}
          </Button>
          <p className="text-xs text-neutral-500">
            By continuing you agree to the terms above. Your name, email, IP
            address and timestamp are recorded.
          </p>
        </form>
      </div>
    </GateShell>
  );
}

export function BlockedGate({
  brand,
  reason,
}: {
  brand: GateBrand;
  reason: string;
}) {
  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <div className="flex items-start gap-3">
          <ShieldX className="mt-0.5 size-5 shrink-0 text-[#93321f]" />
          <div>
            <p className="text-sm font-medium">Access declined</p>
            <p className="mt-1 text-sm text-neutral-600">{reason}</p>
          </div>
        </div>
      </div>
    </GateShell>
  );
}

export function ExpiredGate({ brand }: { brand: GateBrand }) {
  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <div className="flex items-start gap-3">
          <TimerOff className="mt-0.5 size-5 shrink-0 text-neutral-400" />
          <div>
            <p className="text-sm font-medium">This link has expired</p>
            <p className="mt-1 text-sm text-neutral-600">
              Ask the person who shared it with you for a fresh link.
            </p>
          </div>
        </div>
      </div>
    </GateShell>
  );
}
