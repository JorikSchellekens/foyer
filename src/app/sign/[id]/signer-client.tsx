"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FoyerLogo } from "@/components/brand/logo";
import type { CanvasField } from "@/components/signing/pdf-field-canvas";

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
import { missingRequiredFields, FIELD_LABELS } from "@/lib/sign-fields";
import { submitSignature, declineToSign } from "@/app/sign/actions";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

export function SignerClient({
  requestId,
  title,
  teamName,
  brandLogoUrl,
  signerEmail,
  signerName,
  fileUrl,
  fields,
}: {
  requestId: string;
  title: string;
  teamName: string;
  brandLogoUrl: string | null;
  signerEmail: string;
  signerName: string | null;
  fileUrl: string;
  fields: CanvasField[];
}) {
  const router = useRouter();
  const [signature, setSignature] = useState<string | null>(null);
  const [initials, setInitials] = useState<string | null>(null);
  const [adoptedName, setAdoptedName] = useState<string | null>(signerName);
  const [values, setValues] = useState<Record<string, string>>({});
  const [adopting, setAdopting] = useState<"signature" | "initials" | null>(null);
  const [consent, setConsent] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [consentPulse, setConsentPulse] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const missing = missingRequiredFields(
    fields.map((f) => ({ ...f, value: null })),
    values,
    { signature: !!signature, initials: !!initials }
  );
  const done = fields.length - missing.length;
  const ready = missing.length === 0 && consent;

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
    document
      .querySelector(`[data-sign-field="${field.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (field.kind === "TEXT") {
      // Focus once the scroll settles so the signer can type immediately.
      setTimeout(() => {
        document
          .querySelector<HTMLInputElement>(
            `[data-sign-field="${field.id}"] input`
          )
          ?.focus({ preventScroll: true });
      }, 350);
    }
  }

  const goNext = () => goToField(navTargets[0]);

  async function finish() {
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
    if (!consent) {
      toast.info("Tick the agreement checkbox at the bottom to finish.");
      setConsentPulse(true);
      setTimeout(() => setConsentPulse(false), 2500);
      return;
    }
    setBusy(true);
    try {
      const res = await submitSignature(requestId, {
        name: adoptedName ?? undefined,
        signatureData: signature ?? undefined,
        initialsData: initials ?? undefined,
        values,
        consent,
      });
      if (res && "error" in res) toast.error(res.error);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function renderFill(f: CanvasField) {
    switch (f.kind) {
      case "SIGNATURE":
      case "INITIALS": {
        const img = f.kind === "SIGNATURE" ? signature : initials;
        return (
          <button
            type="button"
            className="flex size-full items-center justify-center overflow-hidden bg-[rgba(23,91,71,0.06)] hover:bg-[rgba(23,91,71,0.14)]"
            onClick={() =>
              setAdopting(f.kind === "SIGNATURE" ? "signature" : "initials")
            }
          >
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[11px] font-medium text-primary">
                {f.kind === "SIGNATURE" ? "Sign here" : "Initial"}
              </span>
            )}
          </button>
        );
      }
      case "TEXT":
        return (
          <input
            value={values[f.id] ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.id]: e.target.value }))
            }
            placeholder="Text"
            className="size-full bg-transparent px-1 text-[12px] focus:outline-none"
          />
        );
      case "CHECKBOX":
        return (
          <button
            type="button"
            aria-label="Toggle checkbox"
            className="flex size-full items-center justify-center text-[12px]"
            onClick={() =>
              setValues((v) => ({
                ...v,
                [f.id]: v[f.id] === "true" ? "" : "true",
              }))
            }
          >
            {values[f.id] === "true" ? "✕" : ""}
          </button>
        );
      case "DATE_SIGNED":
        return (
          <span className="flex size-full items-center px-1 font-mono text-[11px] text-muted-foreground">
            {today}
          </span>
        );
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3 sm:px-6">
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandLogoUrl}
            alt={teamName}
            className="h-7 max-w-32 object-contain"
          />
        ) : (
          <FoyerLogo size="sm" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {teamName} requests your signature · {signerEmail}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Popover>
            <PopoverTrigger className="rounded-md border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {done}/{fields.length} fields
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1.5">
              <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
                Your fields
              </p>
              {[...fields]
                .sort(
                  (a, b) =>
                    a.page - b.page || a.yPct - b.yPct || a.xPct - b.xPct
                )
                .map((f) => {
                  const filled =
                    f.kind === "SIGNATURE"
                      ? !!signature
                      : f.kind === "INITIALS"
                        ? !!initials
                        : f.kind === "DATE_SIGNED"
                          ? true
                          : f.kind === "CHECKBOX"
                            ? values[f.id] === "true"
                            : !!(values[f.id] ?? "").trim();
                  const optional =
                    f.kind === "CHECKBOX" || f.kind === "DATE_SIGNED";
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => goToField(f)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                        f.id === activeFieldId ? "bg-accent" : ""
                      }`}
                    >
                      {filled ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                      ) : (
                        <Circle
                          className={`size-3.5 shrink-0 ${
                            optional
                              ? "text-muted-foreground/50"
                              : "text-amber-600"
                          }`}
                        />
                      )}
                      <span className="flex-1 truncate">
                        {FIELD_LABELS[f.kind]}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        p.{f.page}
                      </span>
                    </button>
                  );
                })}
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeclineOpen(true)}
            className="text-muted-foreground"
          >
            Decline
          </Button>
          {navTargets.length > 0 && (
            <Button variant="outline" onClick={goNext} data-testid="next-field">
              {done === 0 ? "Start" : "Next field"}
            </Button>
          )}
          <Button
            onClick={finish}
            disabled={busy}
            variant={ready ? "default" : "secondary"}
            data-testid="finish"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Finish
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <PdfFieldCanvas
          fileUrl={fileUrl}
          fields={fields}
          mode="fill"
          signerColorIndex={{}}
          selectedId={activeFieldId}
          renderFill={renderFill}
        />
      </div>

      <footer
        className={`flex items-center gap-2 border-t bg-card px-4 py-3 transition-shadow sm:px-6 ${
          consentPulse ? "animate-pulse ring-2 ring-inset ring-primary" : ""
        }`}
      >
        <Checkbox
          id="esign-consent"
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
        />
        <Label
          htmlFor="esign-consent"
          className="text-xs font-normal text-muted-foreground"
        >
          I agree to do business electronically and that my electronic signature
          is the legal equivalent of my handwritten signature.
        </Label>
        {brandLogoUrl && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            via <span className="font-display italic">Foyer</span>
          </span>
        )}
      </footer>

      <AdoptSignatureDialog
        open={adopting !== null}
        onOpenChange={(open) => !open && setAdopting(null)}
        kind={adopting ?? "signature"}
        defaultText={
          adopting === "initials"
            ? (signerName ?? "")
                .split(/\s+/)
                .map((p) => p[0] ?? "")
                .join("")
                .toUpperCase()
            : (signerName ?? "")
        }
        onAdopt={(png, typedText) => {
          const remaining = navTargets.filter((f) => f.id !== activeFieldId);
          if (adopting === "initials") {
            setInitials(png);
            const next = remaining.filter((f) => f.kind !== "INITIALS")[0];
            goToField(next);
          } else {
            setSignature(png);
            if (typedText && !signerName) setAdoptedName(typedText);
            // A typed name gives us initials for free - adopt them too so
            // initials fields don't demand a second dialog.
            let coveredInitials = !!initials;
            if (typedText && !initials) {
              const derived = typedToPng(initialsOf(typedText));
              if (derived) {
                setInitials(derived);
                coveredInitials = true;
              }
            }
            const next = remaining.filter(
              (f) =>
                f.kind !== "SIGNATURE" &&
                (!coveredInitials || f.kind !== "INITIALS")
            )[0];
            goToField(next);
          }
        }}
      />

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline to sign?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The sender will be notified and this request will be closed for all
            signers.
          </p>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const res = await declineToSign(requestId, declineReason);
                if (res && "error" in res) toast.error(res.error);
                else router.refresh();
              }}
            >
              Decline
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
