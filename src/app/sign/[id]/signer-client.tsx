"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Check,
  CheckCircle2,
  Circle,
  Loader2,
  PenLine,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FoyerLogo } from "@/components/brand/logo";
import type {
  CanvasField,
  FieldBox,
} from "@/components/signing/pdf-field-canvas";

// pdfjs touches browser globals (DOMMatrix) at module scope - never SSR it.
const PdfFieldCanvas = dynamic(
  () =>
    import("@/components/signing/pdf-field-canvas").then(
      (m) => m.PdfFieldCanvas
    ),
  { ssr: false }
);
import {
  AdoptSignatureDialog,
  typedToPng,
} from "@/components/signing/adopt-signature";
import {
  missingRequiredFields,
  fitFontSize,
  FIELD_LABELS,
  TEXT_INSET_PT,
} from "@/lib/sign-fields";
import {
  submitSignature,
  declineToSign,
  forgetSavedDetails,
} from "@/app/sign/actions";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

// The stamper prints in Helvetica; render fills in the same face so the fit
// computed here matches what lands in the PDF.
const FILL_FONT = "Helvetica, Arial, sans-serif";
const ALIGN_CSS = { LEFT: "left", CENTER: "center", RIGHT: "right" } as const;

export type SavedProfile = {
  name: string | null;
  signatureData: string | null;
  initialsData: string | null;
};

export function SignerClient({
  requestId,
  title,
  teamName,
  brandLogoUrl,
  signerEmail,
  signerName,
  savedProfile,
  fileUrl,
  fields,
}: {
  requestId: string;
  title: string;
  teamName: string;
  brandLogoUrl: string | null;
  signerEmail: string;
  signerName: string | null;
  /** details the signer previously asked us to remember, if any */
  savedProfile: SavedProfile | null;
  fileUrl: string;
  fields: CanvasField[];
}) {
  const router = useRouter();
  // Remembered details are the signer's own words about themselves, so they
  // win over whatever the sender typed; either way the signer can edit.
  const [name, setName] = useState<string>(
    savedProfile?.name ?? signerName ?? ""
  );
  const [signature, setSignature] = useState<string | null>(
    savedProfile?.signatureData ?? null
  );
  const [initials, setInitials] = useState<string | null>(
    savedProfile?.initialsData ?? null
  );
  const [usingSaved, setUsingSaved] = useState(!!savedProfile);
  // Opt-in. Someone who opted in before keeps that choice unless they untick.
  const [remember, setRemember] = useState(!!savedProfile);
  const [forgetting, setForgetting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [adopting, setAdopting] = useState<"signature" | "initials" | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [finalising, setFinalising] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  // Incremented on every jump so the arrival cue replays even when the signer
  // is sent back to the field they are already on.
  const [arrivalTick, setArrivalTick] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // One offscreen context for measuring fill text; created lazily because
  // this component server-renders with the page.
  const measureCtx = useRef<CanvasRenderingContext2D | null>(null);
  function measurePt(text: string, sizePt: number): number {
    if (!measureCtx.current && typeof document !== "undefined")
      measureCtx.current = document.createElement("canvas").getContext("2d");
    const ctx = measureCtx.current;
    if (!ctx) return text.length * sizePt * 0.55;
    ctx.font = `${sizePt}px ${FILL_FONT}`;
    return ctx.measureText(text).width;
  }
  /** Inline style that sizes text like the stamper will, scaled to screen. */
  function textStyle(
    text: string,
    box: FieldBox,
    align: CanvasField["align"]
  ): React.CSSProperties {
    const sizePt = fitFontSize(measurePt, text || "Mg", box.wPt, box.hPt);
    return {
      fontFamily: FILL_FONT,
      fontSize: sizePt * box.scale,
      lineHeight: 1,
      paddingLeft: TEXT_INSET_PT * box.scale,
      paddingRight: TEXT_INSET_PT * box.scale,
      textAlign: ALIGN_CSS[align ?? "LEFT"],
    };
  }

  const missing = missingRequiredFields(
    fields.map((f) => ({ ...f, value: null })),
    values,
    { signature: !!signature, initials: !!initials, name }
  );
  const done = fields.length - missing.length;
  const ready = missing.length === 0;

  function isFilled(f: CanvasField): boolean {
    switch (f.kind) {
      case "SIGNATURE":
        return !!signature;
      case "INITIALS":
        return !!initials;
      case "NAME":
        return !!name.trim();
      case "DATE_SIGNED":
        return true;
      case "CHECKBOX":
        return values[f.id] === "true";
      default:
        return !!(values[f.id] ?? "").trim();
    }
  }
  const filledIds = new Set(fields.filter(isFilled).map((f) => f.id));
  const orderedFields = [...fields].sort(
    (a, b) => a.page - b.page || a.yPct - b.yPct || a.xPct - b.xPct
  );

  // Guided navigation: the unfilled fields that actually need a hand, in
  // reading order across pages. DATE_SIGNED auto-fills; checkboxes are valid
  // unchecked - neither needs a visit.
  const unfilledIds = new Set(missing.map((f) => f.id));
  const navTargets = fields
    .filter(
      (f) =>
        unfilledIds.has(f.id) &&
        f.kind !== "DATE_SIGNED" &&
        f.kind !== "CHECKBOX"
    )
    .sort((a, b) => a.page - b.page || a.yPct - b.yPct || a.xPct - b.xPct);

  function goToField(field: CanvasField | undefined) {
    if (!field) return;
    setActiveFieldId(field.id);
    setArrivalTick((t) => t + 1);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(`[data-sign-field="${field.id}"]`)?.scrollIntoView({
      behavior: still ? "auto" : "smooth",
      block: "center",
    });
    if (field.kind === "TEXT" || field.kind === "NAME") {
      // Focus once the scroll settles so the signer can type immediately.
      setTimeout(
        () => {
          document
            .querySelector<HTMLInputElement>(
              `[data-sign-field="${field.id}"] input`
            )
            ?.focus({ preventScroll: true });
        },
        still ? 0 : 350
      );
    }
  }

  const goNext = () => goToField(navTargets[0]);

  function sign() {
    // Never a dead button: explain and point at whatever still blocks.
    if (navTargets.length > 0) {
      toast.info(
        navTargets.length === 1
          ? "One required field still needs your attention."
          : `${navTargets.length} required fields still need your attention.`
      );
      goNext();
      return;
    }
    setConfirmOpen(true);
  }

  async function agreeAndSign() {
    setBusy(true);
    try {
      const res = await submitSignature(requestId, {
        name: name.trim() || undefined,
        signatureData: signature ?? undefined,
        initialsData: initials ?? undefined,
        values,
        // Clicking "Agree and sign" in the confirmation dialog IS the consent
        // action (clickwrap); recorded as the consented audit event.
        consent: true,
        remember,
      });
      if (res && "error" in res) toast.error(res.error);
      else {
        // Hold the dialog on a confirmed state rather than blinking shut: the
        // refresh replaces this page with the signed receipt.
        setFinalising(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    setForgetting(true);
    try {
      const res = await forgetSavedDetails(requestId);
      if (res && "error" in res) {
        toast.error(res.error);
        return;
      }
      setUsingSaved(false);
      setRemember(false);
      setSignature(null);
      setInitials(null);
      setName(signerName ?? "");
      toast.success("Your saved details have been removed.");
    } finally {
      setForgetting(false);
    }
  }

  function renderFill(f: CanvasField, box: FieldBox) {
    switch (f.kind) {
      case "SIGNATURE":
      case "INITIALS": {
        const img = f.kind === "SIGNATURE" ? signature : initials;
        const isSig = f.kind === "SIGNATURE";
        // Prompt sized to the box, never to the viewport: a phone-width page
        // draws a 22%-wide signature box under 80px.
        const promptPx = Math.max(9, Math.min(13, box.hPt * box.scale * 0.45));
        return (
          <button
            type="button"
            aria-label={
              img
                ? `Change your ${isSig ? "signature" : "initials"}`
                : isSig
                  ? "Add your signature"
                  : "Add your initials"
            }
            className="flex size-full items-center justify-center overflow-hidden rounded-sm transition-colors duration-[var(--dur-fast)] hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setAdopting(isSig ? "signature" : "initials")}
          >
            {img ? (
              // Bottom-left like the stamp, so the signature sits on the line
              // the sender placed rather than floating mid-box.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img}
                alt=""
                className="mr-auto mt-auto max-h-full max-w-full animate-in object-contain object-left-bottom fade-in-0 zoom-in-95 duration-[var(--dur)] ease-[var(--ease-out-quint)]"
              />
            ) : (
              <span
                className="flex min-w-0 items-center gap-1 px-0.5 font-medium text-primary"
                style={{ fontSize: promptPx }}
              >
                <PenLine
                  className="shrink-0"
                  style={{ width: promptPx, height: promptPx }}
                  aria-hidden
                />
                <span className="truncate">{isSig ? "Sign" : "Initial"}</span>
              </span>
            )}
          </button>
        );
      }
      case "NAME":
        return (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            aria-label={`Name field on page ${f.page}`}
            autoComplete="name"
            className="size-full rounded-sm bg-transparent placeholder:text-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={textStyle(name || "Full name", box, f.align)}
          />
        );
      case "TEXT":
        return (
          <input
            value={values[f.id] ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.id]: e.target.value }))
            }
            placeholder="Text"
            aria-label={`Text field on page ${f.page}`}
            className="size-full rounded-sm bg-transparent placeholder:text-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={textStyle(values[f.id] || "Text", box, f.align)}
          />
        );
      case "CHECKBOX":
        return (
          <button
            type="button"
            role="checkbox"
            aria-checked={values[f.id] === "true"}
            aria-label="Toggle checkbox"
            className="flex size-full items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() =>
              setValues((v) => ({
                ...v,
                [f.id]: v[f.id] === "true" ? "" : "true",
              }))
            }
          >
            {values[f.id] === "true" && (
              <Check
                className="size-full animate-in p-px text-primary zoom-in-50 duration-[var(--dur-fast)]"
                aria-hidden
              />
            )}
          </button>
        );
      case "DATE_SIGNED":
        return (
          <span
            className="flex size-full items-center whitespace-nowrap tabular text-foreground/80"
            style={{
              ...textStyle(today, box, f.align),
              justifyContent:
                f.align === "CENTER"
                  ? "center"
                  : f.align === "RIGHT"
                    ? "flex-end"
                    : "flex-start",
            }}
          >
            {today}
          </span>
        );
    }
  }

  const remainingCount = navTargets.length;

  return (
    <div className="flex h-screen flex-col">
      <header className="relative z-30 flex items-center gap-3 border-b bg-card px-4 py-2.5 sm:px-6">
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandLogoUrl}
            alt={teamName}
            className="h-7 max-w-32 shrink-0 object-contain"
          />
        ) : (
          <FoyerLogo size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {teamName} requests your signature · {signerEmail}
          </p>
        </div>

        <Popover>
          <PopoverTrigger
            aria-label="Show your fields"
            className="focus-ring shrink-0 rounded-md border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground"
          >
            <span className="tabular">
              {done}/{fields.length}
            </span>{" "}
            fields
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-1.5">
            <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
              Your fields
            </p>
            {orderedFields.map((f) => {
              const filled = filledIds.has(f.id);
              const optional =
                f.kind === "CHECKBOX" || f.kind === "DATE_SIGNED";
              const isNext = navTargets[0]?.id === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => goToField(f)}
                  aria-current={f.id === activeFieldId ? "true" : undefined}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors duration-[var(--dur-fast)] hover:bg-accent ${
                    f.id === activeFieldId ? "bg-accent" : ""
                  }`}
                >
                  {filled ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <Circle
                      className={`size-3.5 shrink-0 ${
                        optional ? "text-muted-foreground/50" : "text-primary/70"
                      }`}
                    />
                  )}
                  <span
                    className={`flex-1 truncate ${
                      filled ? "text-muted-foreground" : ""
                    }`}
                  >
                    {FIELD_LABELS[f.kind]}
                  </span>
                  {isNext && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-primary">
                      Next
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[10px] tabular text-muted-foreground">
                    p.{f.page}
                  </span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

        {/* Action group. On a phone it detaches into a thumb-reachable bar so
            the flow stays one-handed; it is rendered once either way. */}
        <div className="flex items-center gap-2 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:border-t max-sm:bg-card max-sm:px-3 max-sm:py-2 max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))] max-sm:shadow-[var(--shadow-overlay)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeclineOpen(true)}
            className="text-muted-foreground"
          >
            Decline
          </Button>
          {remainingCount > 0 && (
            <Button
              variant="default"
              onClick={goNext}
              data-testid="next-field"
              className="max-sm:flex-1"
            >
              <ArrowDown aria-hidden />
              {done === 0 ? "Start" : "Next field"}
            </Button>
          )}
          <Button
            onClick={sign}
            disabled={busy || finalising}
            variant={ready ? "default" : "outline"}
            data-testid="sign"
            className="max-sm:flex-1"
          >
            {ready && <Check aria-hidden />}
            Sign
          </Button>
        </div>

        {/* Honest, quiet progress: the hairline under the header fills as the
            document does. */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px bg-primary/15"
        >
          <span
            className="block h-full bg-primary transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out-quint)]"
            style={{
              width: `${fields.length ? (done / fields.length) * 100 : 0}%`,
            }}
          />
        </span>
      </header>

      {/* Remembered details are applied silently nowhere: the signer is told
          what was reused and can drop it in one click. */}
      {usingSaved && (
        <div
          data-testid="saved-details"
          className="flex items-center gap-2 border-b bg-accent/40 px-4 py-1.5 text-xs text-muted-foreground sm:px-6"
        >
          <UserRound className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            Using the name and signature you saved earlier
            {name ? ` as ${name}` : ""}.
          </span>
          <button
            type="button"
            onClick={forget}
            disabled={forgetting}
            data-testid="forget-details"
            className="focus-ring underline-grow shrink-0 rounded text-xs transition-colors hover:text-foreground disabled:opacity-50"
          >
            {forgetting ? "Removing" : "Forget my saved details"}
          </button>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {remainingCount === 0
          ? "All required fields are complete. You can sign."
          : `${remainingCount} required ${
              remainingCount === 1 ? "field" : "fields"
            } remaining.`}
      </p>

      <div className="min-h-0 flex-1 max-sm:pb-[3.5rem]">
        <PdfFieldCanvas
          fileUrl={fileUrl}
          fields={fields}
          mode="fill"
          signerColorIndex={{}}
          selectedId={activeFieldId}
          filledIds={filledIds}
          arrivalTick={arrivalTick}
          renderFill={renderFill}
        />
      </div>

      {brandLogoUrl && (
        <span className="pointer-events-none fixed bottom-3 right-4 z-30 text-xs text-muted-foreground/70 max-sm:bottom-16">
          via <span className="font-display italic">Foyer</span>
        </span>
      )}

      <Dialog
        open={confirmOpen}
        // Never dismissable mid-submit: the request is in flight.
        onOpenChange={(o) => {
          if (!busy && !finalising) setConfirmOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!finalising}>
          {finalising ? (
            <>
              <DialogHeader>
                <DialogTitle>Signed</DialogTitle>
              </DialogHeader>
              <div className="flex items-start gap-3 py-1">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Your signature has been recorded. Preparing your copy of{" "}
                  <strong className="font-medium text-foreground">
                    {title}
                  </strong>
                  .
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                One moment
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Sign {title}?</DialogTitle>
              </DialogHeader>
              <dl className="divide-y rounded-md border text-sm">
                <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <dt className="text-muted-foreground">Signing as</dt>
                  <dd className="min-w-0 truncate font-medium">
                    {name.trim() || signerEmail}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="min-w-0 truncate">{signerEmail}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <dt className="text-muted-foreground">Fields</dt>
                  <dd className="tabular">
                    {fields.length} of {fields.length} complete
                  </dd>
                </div>
              </dl>
              {/* The disclosure. Held to a readable measure, and scrollable
                  rather than clipped if a translation runs long. */}
              <div className="max-h-[38vh] overflow-y-auto">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  By choosing Agree and sign, you agree to do business
                  electronically with {teamName} and that your electronic
                  signature is the legal equivalent of your handwritten
                  signature.
                </p>
              </div>
              {/* Separate, unticked-by-default consent for keeping personal
                  data past this envelope. Never bundled into the signing
                  consent above. */}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                  data-testid="remember-details"
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block">
                    Remember my name and signature for next time
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    Kept with {signerEmail} and shown only after you open a
                    signing link sent to it. Remove it any time from a signing
                    page or your signed-documents page.
                  </span>
                </span>
              </label>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setConfirmOpen(false)}
                  disabled={busy}
                >
                  Go back
                </Button>
                <Button
                  size="lg"
                  onClick={agreeAndSign}
                  disabled={busy}
                  data-testid="agree-sign"
                >
                  {busy ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Signing
                    </>
                  ) : (
                    <>
                      <PenLine aria-hidden />
                      Agree and sign
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AdoptSignatureDialog
        open={adopting !== null}
        onOpenChange={(open) => !open && setAdopting(null)}
        kind={adopting ?? "signature"}
        defaultText={adopting === "initials" ? initialsOf(name) : name}
        onAdopt={(png, adoptedName) => {
          const remaining = navTargets.filter((f) => f.id !== activeFieldId);
          if (adopting === "initials") {
            setInitials(png);
            const next = remaining.filter((f) => f.kind !== "INITIALS")[0];
            goToField(next);
          } else {
            setSignature(png);
            if (adoptedName) setName(adoptedName);
            // The name gives us initials for free - adopt them too so
            // initials fields don't demand a second dialog.
            let coveredInitials = !!initials;
            if (adoptedName && !initials) {
              const derived = typedToPng(initialsOf(adoptedName));
              if (derived) {
                setInitials(derived);
                coveredInitials = true;
              }
            }
            const next = remaining.filter(
              (f) =>
                f.kind !== "SIGNATURE" &&
                f.kind !== "NAME" &&
                (!coveredInitials || f.kind !== "INITIALS")
            )[0];
            goToField(next);
          }
        }}
      />

      <Dialog
        open={declineOpen}
        onOpenChange={(o) => {
          if (!declining) setDeclineOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline to sign?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The sender will be notified and this request will be closed for all
            signers.
          </p>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason (optional)"
            aria-label="Reason for declining"
            rows={2}
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setDeclineOpen(false)}
              disabled={declining}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="lg"
              disabled={declining}
              onClick={async () => {
                setDeclining(true);
                const res = await declineToSign(requestId, declineReason);
                if (res && "error" in res) {
                  toast.error(res.error);
                  setDeclining(false);
                } else router.refresh();
              }}
            >
              {declining && <Loader2 className="animate-spin" aria-hidden />}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
