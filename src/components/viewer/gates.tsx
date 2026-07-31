"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Lock,
  MailCheck,
  ShieldX,
  TimerOff,
  FileSignature,
  Loader2,
  Check,
  AtSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "./signature-pad";
import { FoyerMark } from "@/components/brand/logo";
import { contrastText } from "@/lib/contrast";
import {
  submitPassword,
  submitEmail,
  signAgreement,
  requestAccess,
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
        <div className="h-32 w-full overflow-hidden sm:h-52">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.bannerUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 items-center justify-center px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-10 sm:px-6 sm:pt-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-start gap-4">
            <div className="stagger-item" style={{ "--i": 0 } as React.CSSProperties}>
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
            </div>
            <div className="stagger-item" style={{ "--i": 1 } as React.CSSProperties}>
              <p className="text-sm opacity-60">{brand.teamName} shared</p>
              <h1 className="font-display text-3xl leading-tight tracking-tight">
                {brand.itemName}
              </h1>
            </div>
            {brand.welcomeMessage && (
              <p
                className="stagger-item whitespace-pre-wrap text-sm leading-relaxed opacity-80"
                style={{ "--i": 2 } as React.CSSProperties}
              >
                {brand.welcomeMessage}
              </p>
            )}
          </div>
          {/*
           * Opacity-only reveal: the signature pad measures its own canvas, so
           * this wrapper must never be mid-transform under it.
           */}
          <div className="reveal">{children}</div>
        </div>
      </div>
      <footer className="flex items-center justify-center gap-1.5 pb-6 text-xs opacity-40">
        <FoyerMark className="size-3" />
        Secured by Foyer
      </footer>
    </main>
  );
}

/**
 * The threshold card: paper, hairline, floated off the branded background.
 *
 * Fixed light, deliberately - no dark: variants here. What a visitor meets at
 * the door is the sharing team's branding, not their own OS preference: the
 * surrounding surface is the team's chosen backgroundColor and the accents are
 * their brand colour, so letting a visitor's dark mode repaint the card would
 * put an unreviewed colour scheme on someone else's front page. The viewer
 * chrome past the gate is permanently dark for the same reason.
 */
const cardClass =
  "rounded-xl border border-black/[0.07] bg-white p-6 text-neutral-900 shadow-[var(--shadow-overlay)]";

/** Heading row shared by every gate: icon in the brand colour, display face. */
function GateHeading({
  icon,
  title,
  hint,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: color
              ? `color-mix(in oklab, ${color} 12%, transparent)`
              : undefined,
            color,
          }}
        >
          {icon}
        </span>
        <h2 className="font-display text-lg leading-snug text-neutral-900">
          {title}
        </h2>
      </div>
      {hint && (
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Submit button that reads as busy without losing its label. Pass `color` to
 * paint it in the sender's brand colour; omit it for the app's own primary.
 */
function GateSubmit({
  busy,
  disabled,
  color,
  children,
  busyLabel,
}: {
  busy: boolean;
  disabled?: boolean;
  color?: string;
  children: React.ReactNode;
  busyLabel: string;
}) {
  return (
    <Button
      type="submit"
      className="h-10 w-full"
      style={
        color
          ? { backgroundColor: color, color: contrastText(color) }
          : undefined
      }
      disabled={disabled || busy}
      aria-busy={busy}
    >
      {busy ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

function FieldError({ message }: { message: string | null }) {
  return (
    <p
      aria-live="polite"
      className={`overflow-hidden text-[13px] text-[#93321f] transition-all duration-[var(--dur)] ease-[var(--ease-out-quint)] ${
        message ? "max-h-10 opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      {message}
    </p>
  );
}

export function PasswordGate({
  slug,
  brand,
}: {
  slug: string;
  brand: GateBrand;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <GateHeading
          icon={<Lock className="size-4" />}
          title="This link is password protected"
          hint={`${brand.teamName} set a password on this link. Enter it to continue.`}
          color={brand.brandColor}
        />
        <form
          className="space-y-3"
          action={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await submitPassword(slug, password);
              if (res && "error" in res && res.error) setError(res.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Enter password"
            autoFocus
            required
            autoComplete="current-password"
            aria-label="Password"
            aria-invalid={!!error}
            className="h-10 bg-white"
          />
          <FieldError message={error} />
          <GateSubmit
            busy={busy}
            disabled={!password}
            color={brand.brandColor}
            busyLabel="Checking…"
          >
            Continue
          </GateSubmit>
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
  const [error, setError] = useState<string | null>(null);

  if (sent)
    return <VerifySentGate brand={brand} email={email} />;

  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <GateHeading
          icon={
            requireVerification ? (
              <MailCheck className="size-4" />
            ) : (
              <AtSign className="size-4" />
            )
          }
          title={
            requireVerification
              ? "Verify your email to continue"
              : "Tell us who is reading"
          }
          hint={
            requireVerification
              ? "We will email you a link that opens the document on this device."
              : `${brand.teamName} keeps a record of who opens this link.`
          }
          color={brand.brandColor}
        />
        <form
          className="space-y-3"
          action={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await submitEmail(slug, email);
              if (res && "error" in res && res.error) {
                setError(res.error);
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
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="you@company.com"
              autoFocus
              required
              autoComplete="email"
              inputMode="email"
              aria-invalid={!!error}
              className="h-10 bg-white"
            />
          </div>
          <FieldError message={error} />
          <GateSubmit
            busy={busy}
            disabled={!email.includes("@")}
            color={brand.brandColor}
            busyLabel="One moment…"
          >
            {requireVerification ? "Send verification link" : "View document"}
          </GateSubmit>
          <p className="text-xs leading-relaxed text-neutral-500">
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
        <GateHeading
          icon={<MailCheck className="size-4" />}
          title="Check your inbox"
          color={brand.brandColor}
        />
        <p className="text-sm leading-relaxed text-neutral-600">
          We sent a verification link
          {email ? (
            <>
              {" to "}
              <span className="font-medium text-neutral-900">{email}</span>
            </>
          ) : null}
          . Open it on this device to continue to the document.
        </p>
        <p className="mt-4 border-t border-black/[0.07] pt-3 text-xs leading-relaxed text-neutral-500">
          Nothing yet? Check your spam folder. You can keep this tab open.
        </p>
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
        <GateHeading
          icon={<FileSignature className="size-4" />}
          title={agreement.name}
          hint="Review and accept before the documents open."
          color={brand.brandColor}
        />

        {agreement.type === "TEXT" && agreement.content && (
          <div className="mb-4 max-h-48 overflow-y-auto overscroll-contain whitespace-pre-wrap rounded-lg border border-black/[0.07] bg-neutral-50 p-3.5 text-xs leading-relaxed text-neutral-700">
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
              className="underline-grow font-medium"
              style={{ color: brand.brandColor }}
            >
              open document
            </a>
          </p>
        )}
        {agreement.type === "EMBEDDED" && agreement.fileUrl && (
          <div className="mb-4 h-72 overflow-hidden rounded-lg border border-black/[0.07] bg-neutral-50">
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
                autoComplete="name"
                className="h-10 bg-white"
              />
            </div>
          )}
          {agreement.type === "EMBEDDED" && (
            <SignaturePad onChange={setSignature} />
          )}
          <GateSubmit
            busy={busy}
            disabled={!canSubmit}
            color={brand.brandColor}
            busyLabel="Recording signature…"
          >
            Agree and continue
          </GateSubmit>
          <p className="text-xs leading-relaxed text-neutral-500">
            By continuing you agree to the terms above. Your name, email, IP
            address and timestamp are recorded.
          </p>
        </form>
      </div>
    </GateShell>
  );
}

export function BlockedGate({
  slug,
  brand,
  reason,
  defaultEmail = "",
}: {
  slug: string;
  brand: GateBrand;
  reason: string;
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <div className="flex items-start gap-3">
          <ShieldX
            className="mt-0.5 size-5 shrink-0 text-[#93321f]"
            strokeWidth={1.75}
          />
          <div>
            <h2 className="font-display text-lg leading-snug">Access declined</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
              {reason}
            </p>
          </div>
        </div>

        {sent ? (
          <div className="reveal mt-5 flex items-start gap-2.5 rounded-lg border border-black/[0.07] bg-neutral-50 px-3.5 py-3 text-sm text-neutral-600">
            <Check
              className="mt-0.5 size-4 shrink-0"
              style={{ color: brand.brandColor }}
            />
            <span>
              Your request was sent. You will hear back if access is granted.
            </span>
          </div>
        ) : (
          <form
            className="mt-5 space-y-3 border-t border-black/[0.07] pt-4"
            action={async () => {
              setBusy(true);
              try {
                const res = await requestAccess(slug, email, note);
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                setSent(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="text-sm text-neutral-600">
              Think this is a mistake? Ask the owner for access.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="req-email">Your email</Label>
              <Input
                id="req-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                inputMode="email"
                className="h-10 bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-note">Note (optional)</Label>
              <Input
                id="req-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Who you are, why you need access"
                className="h-10 bg-white"
              />
            </div>
            <GateSubmit busy={busy} busyLabel="Sending…">
              Request access
            </GateSubmit>
          </form>
        )}
      </div>
    </GateShell>
  );
}

export function ExpiredGate({ brand }: { brand: GateBrand }) {
  return (
    <GateShell brand={brand}>
      <div className={cardClass}>
        <div className="flex items-start gap-3">
          <TimerOff
            className="mt-0.5 size-5 shrink-0 text-neutral-400"
            strokeWidth={1.75}
          />
          <div>
            <h2 className="font-display text-lg leading-snug">
              This link has expired
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
              Ask the person who shared it with you for a fresh link. The
              documents themselves have not gone anywhere.
            </p>
          </div>
        </div>
      </div>
    </GateShell>
  );
}
