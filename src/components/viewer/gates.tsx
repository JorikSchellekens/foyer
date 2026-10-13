"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Check, TimerOff } from "lucide-react";
import { SignaturePad } from "./signature-pad";
import {
  submitPassword,
  submitEmail,
  signAgreement,
  requestAccess,
} from "@/app/view/actions";

export type GateBrand = {
  teamName: string;
  itemName: string;
  itemKind: "document" | "dataroom";
  brandColor: string;
  backgroundColor: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  welcomeMessage: string | null;
  homeUrl: string | null;
};

/*
 * The gate is fixed dark, deliberately - no light variant, no visitor theme,
 * and no team colours on the surface. The sharing team supplies identity
 * (name, logo, link, welcome message); the door itself is one reviewed design
 * for every link, so nothing a team configures can leave it unreadable.
 */
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isEmail = (v: string) => EMAIL_RE.test(v.trim());

const noun = (brand: GateBrand) =>
  brand.itemKind === "dataroom" ? "data room" : "document";

const labelClass = "mb-2 block text-[13px] text-[#969696]";

const inputClass =
  "block h-[54px] w-full rounded-xl border border-[#2e2e33] bg-[#121215] px-[18px] text-[17px] text-[#ececec] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#5e5e64] focus:border-[#4a78d0] focus:shadow-[0_0_0_3px_rgba(60,110,200,.25)] read-only:opacity-70";

const inputErrorClass =
  "border-[rgba(232,97,107,.7)] focus:border-[rgba(232,97,107,.7)] focus:shadow-none";

const alertClass =
  "rounded-xl border border-[rgba(232,97,107,.45)] bg-[rgba(232,97,107,.07)] px-[15px] py-[13px] text-sm leading-normal text-[#f1c9cc]";

const panelClass =
  "rounded-xl border border-[#2e2e33] bg-[#121215] px-[15px] py-[13px] text-sm leading-normal text-[#969696]";

const noteClass = "mt-5 text-balance text-center text-sm leading-normal text-[#6f6f6f]";

export function GateShell({
  brand,
  lead,
  wide,
  children,
}: {
  brand: GateBrand;
  lead?: React.ReactNode;
  /** Room for an embedded agreement; every other gate keeps the 440 px window. */
  wide?: boolean;
  children?: React.ReactNode;
}) {
  const logo = brand.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logoUrl}
      alt={brand.teamName}
      className="h-8 w-auto max-w-40 object-contain"
    />
  ) : (
    <span className="text-lg text-[#ececec]">{brand.teamName}</span>
  );

  return (
    <div
      className="flex min-h-screen flex-col bg-black text-[#ececec] antialiased"
      style={{ fontFamily: FONT }}
    >
      <header className="flex h-[72px] shrink-0 items-center border-b border-white/[0.08] px-[max(20px,calc((100vw-1440px)/2+110px))]">
        {brand.homeUrl ? (
          <a
            href={brand.homeUrl}
            aria-label={brand.teamName}
            className="block leading-none"
          >
            {logo}
          </a>
        ) : (
          logo
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 pb-[max(56px,env(safe-area-inset-bottom))] pt-14">
        <div
          className={`w-full rounded-[20px] border border-[#232328] bg-[#0b0b0d] px-6 pb-7 pt-9 shadow-[0_40px_120px_rgba(0,0,0,.7)] min-[521px]:rounded-[22px] min-[521px]:px-10 min-[521px]:pb-9 min-[521px]:pt-11 ${
            wide ? "max-w-[560px]" : "max-w-[440px]"
          }`}
        >
          <p className="mb-[18px] flex items-center gap-2.5 text-sm text-[#969696]">
            <i
              aria-hidden
              className="size-[7px] rounded-full bg-[#5fa5ff] shadow-[0_0_10px_#5fa5ff]"
            />
            Shared by {brand.teamName}
          </p>
          <h1 className="text-[30px] font-light leading-[1.12] tracking-[-0.015em] [overflow-wrap:anywhere] min-[521px]:text-[34px]">
            {brand.itemName}
          </h1>
          {lead && (
            <p className="mt-3 text-base leading-normal text-[#969696]">
              {lead}
            </p>
          )}
          {brand.welcomeMessage && (
            <p className="mt-4 whitespace-pre-wrap border-l border-[#2e2e33] pl-3.5 text-sm leading-relaxed text-[#969696]">
              {brand.welcomeMessage}
            </p>
          )}
          {children}
        </div>

        <p className="mt-[30px] flex items-center gap-[7px] text-[13px] text-[#55555b]">
          <svg
            viewBox="0 0 11 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            aria-hidden
            className="h-3 w-[11px]"
          >
            <rect x="1" y="5" width="9" height="6.4" rx="1.4" />
            <path d="M3 5V3.6a2.5 2.5 0 0 1 5 0V5" />
          </svg>
          Secured by Foyer
        </p>
      </main>
    </div>
  );
}

/**
 * Pill submit. Disabled reads as inert grey until the form can go; pending
 * keeps the blue and swaps the label for a spinner. The label stays in the
 * DOM (transparent) so the button keeps its width and its accessible name.
 *
 * Pending comes from the form, not component state: a setState inside a form
 * action is part of the action's transition and would only render once the
 * action had already finished.
 */
function GateSubmit({
  disabled,
  children,
}: {
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const state = pending
    ? "bg-[#3c6ec8] text-transparent"
    : disabled
      ? "cursor-default bg-[#1c1c20] text-[#6f6f6f]"
      : "cursor-pointer bg-[#3c6ec8] text-white hover:bg-[#4a7dd6]";
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={`relative mt-3.5 flex h-[52px] w-full items-center justify-center rounded-full text-[17px] transition-colors duration-150 ${state}`}
    >
      {children}
      {pending && (
        <span
          aria-hidden
          className="absolute size-5 animate-spin rounded-full border-2 border-white/35 border-t-white"
        />
      )}
    </button>
  );
}

/** Field that holds still while its form is submitting. */
function GateInput({
  invalid,
  ref,
  ...props
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <input
      ref={ref}
      {...props}
      readOnly={pending}
      aria-invalid={invalid || undefined}
      className={`${inputClass} ${invalid ? inputErrorClass : ""}`}
    />
  );
}

function GateError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className={`${alertClass} mt-3`}>
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
  const [error, setError] = useState<string | null>(null);
  return (
    <GateShell
      brand={brand}
      lead={`${brand.teamName} set a password on this link. Enter it to open the ${noun(brand)}.`}
    >
      <form
        className="mt-[30px]"
        action={async () => {
          setError(null);
            const res = await submitPassword(slug, password);
            if (res && "error" in res && res.error) setError(res.error);
        }}
      >
        <label htmlFor="gate-password" className={labelClass}>
          Password
        </label>
        <GateInput
          id="gate-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          autoFocus
          required
         
          autoComplete="current-password"
          invalid={!!error}
        />
        <GateError message={error} />
        <GateSubmit disabled={!password}>
          Continue
        </GateSubmit>
      </form>
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
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  if (sent) return <VerifySentGate brand={brand} email={email} />;

  const invalid = () => {
    setError("Enter a valid work email.");
    field.current?.focus();
  };

  return (
    <GateShell
      brand={brand}
      lead={
        requireVerification
          ? `Enter your work email. We will send you a link that opens the ${noun(brand)} on this device.`
          : `Enter your work email to open the ${noun(brand)}.`
      }
    >
      <form
        className="mt-[30px]"
        noValidate
        action={async () => {
          if (!isEmail(email)) return invalid();
          setError(null);
            const res = await submitEmail(slug, email);
            if (res && "error" in res && res.error) {
              setError(res.error);
              field.current?.focus();
              return;
            }
            if (res && "pendingVerification" in res && res.pendingVerification)
              setSent(true);
        }}
      >
        <label htmlFor="gate-email" className={labelClass}>
          Work email
        </label>
        <GateInput
          ref={field}
          id="gate-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          // The button stays disabled until the address is valid, so a typo
          // would otherwise sit there unexplained: say so when the field is left.
          onBlur={() => {
            if (email.trim() && !isEmail(email)) invalid();
          }}
          placeholder="you@company.com"
          autoFocus
          required
         
          autoComplete="email"
          inputMode="email"
          invalid={!!error}
        />
        <GateError message={error} />
        <GateSubmit disabled={!isEmail(email)}>
          {requireVerification
            ? "Send verification link"
            : brand.itemKind === "dataroom"
              ? "Open data room"
              : "View document"}
        </GateSubmit>
      </form>
      <p className={noteClass}>
        {brand.teamName} keeps a record of who opens this link.
        <br className="max-[520px]:hidden" /> We see your email and the time
        spent on each page.
      </p>
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
    <GateShell
      brand={brand}
      lead={
        <>
          We sent a verification link
          {email ? (
            <>
              {" to "}
              <span className="text-[#ececec]">{email}</span>
            </>
          ) : null}
          . Open it on this device to continue to the {noun(brand)}.
        </>
      }
    >
      <p className={noteClass}>
        Nothing yet? Check your spam folder. You can keep this tab open.
      </p>
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

  const canSubmit =
    (!agreement.requireName || name.trim().length > 1) &&
    (agreement.type !== "EMBEDDED" || !!signature);

  return (
    <GateShell
      brand={brand}
      wide={agreement.type === "EMBEDDED"}
      lead={
        <>
          Review and accept{" "}
          <span className="text-[#ececec]">{agreement.name}</span> before the{" "}
          {noun(brand)} opens.
        </>
      }
    >
      <div className="mt-[30px]">
        {agreement.type === "TEXT" && agreement.content && (
          <div
            className={`${panelClass} max-h-48 overflow-y-auto overscroll-contain whitespace-pre-wrap text-[13px] leading-relaxed`}
          >
            {agreement.content}
          </div>
        )}
        {agreement.type === "LINK" && agreement.externalUrl && (
          <p className={panelClass}>
            Read the agreement:{" "}
            <a
              href={agreement.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#ececec] underline decoration-white/30 underline-offset-4 hover:decoration-white"
            >
              open document
            </a>
          </p>
        )}
        {agreement.type === "EMBEDDED" && agreement.fileUrl && (
          <div className="h-72 overflow-hidden rounded-xl border border-[#2e2e33] bg-[#121215]">
            <iframe
              src={`${agreement.fileUrl}#toolbar=0`}
              title={agreement.name}
              className="h-full w-full"
            />
          </div>
        )}
      </div>

      <form
        className="mt-5"
        action={async () => {
            const res = await signAgreement(slug, {
              name: name || undefined,
              signatureData: signature ?? undefined,
            });
            if (res && "error" in res && res.error) toast.error(res.error);
        }}
      >
        {agreement.requireName && (
          <div className="mb-4">
            <label htmlFor="sig-name" className={labelClass}>
              Full legal name
            </label>
            <GateInput
              id="sig-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Appleseed"
              required
             
              autoComplete="name"
            />
          </div>
        )}
        {agreement.type === "EMBEDDED" && (
          <SignaturePad onChange={setSignature} />
        )}
        <GateSubmit disabled={!canSubmit}>
          Agree and continue
        </GateSubmit>
      </form>
      <p className={noteClass}>
        By continuing you agree to the terms above. Your name, email, IP
        address and timestamp are recorded.
      </p>
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
  const [sent, setSent] = useState(false);

  return (
    <GateShell brand={brand}>
      <div role="alert" className={`${alertClass} mt-[30px]`}>
        <p className="font-medium">Access declined</p>
        <p className="mt-1">{reason}</p>
      </div>

      {sent ? (
        <p className={`${panelClass} mt-4 flex items-start gap-2.5`}>
          <Check className="mt-0.5 size-4 shrink-0 text-[#5fa5ff]" />
          <span>
            Your request was sent. You will hear back if access is granted.
          </span>
        </p>
      ) : (
        <form
          className="mt-6"
          action={async () => {
              const res = await requestAccess(slug, email, note);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              setSent(true);
          }}
        >
          <p className="mb-4 text-base leading-normal text-[#969696]">
            Think this is a mistake? Ask {brand.teamName} for access.
          </p>
          <label htmlFor="req-email" className={labelClass}>
            Work email
          </label>
          <GateInput
            id="req-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
           
            autoComplete="email"
            inputMode="email"
          />
          <label htmlFor="req-note" className={`${labelClass} mt-4`}>
            Note (optional)
          </label>
          <GateInput
            id="req-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Who you are, why you need access"
           
          />
          <GateSubmit disabled={!isEmail(email)}>
            Request access
          </GateSubmit>
        </form>
      )}
    </GateShell>
  );
}

export function ExpiredGate({ brand }: { brand: GateBrand }) {
  return (
    <GateShell
      brand={brand}
      lead="This link has expired. Ask the person who shared it with you for a fresh link."
    >
      <p className={`${panelClass} mt-[30px] flex items-start gap-2.5`}>
        <TimerOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <span>
          The {noun(brand) === "document" ? "document itself has" : "documents themselves have"}{" "}
          not gone anywhere.
        </span>
      </p>
    </GateShell>
  );
}
