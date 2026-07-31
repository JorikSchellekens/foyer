"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/viewer/signature-pad";

// Widely-available script faces; canvas falls back down the stack, so the
// typed signature renders in a handwriting style on every platform without
// shipping a font file.
const SCRIPT_FONT =
  '"Snell Roundhand","Savoye LET","Segoe Script","Brush Script MT","Dancing Script",cursive';

/** Render typed text in the script face onto an offscreen canvas -> PNG.
 * Sized from the measured ink extent (script capitals overshoot any fixed
 * line-height - the old fontSize*1.6 box clipped their tops). */
export function typedToPng(text: string): string | null {
  const trimmed = text.trim();
  // Called during render, and this component server-renders with the page.
  if (!trimmed || typeof document === "undefined") return null;
  const scale = 3; // supersample so the stamped PDF image stays crisp
  const fontSize = 44;
  const pad = 10;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `${fontSize}px ${SCRIPT_FONT}`;
  const m = probe.measureText(trimmed);
  const ascent = Math.ceil(m.actualBoundingBoxAscent || fontSize);
  const descent = Math.ceil(m.actualBoundingBoxDescent || fontSize * 0.35);
  const left = Math.ceil(m.actualBoundingBoxLeft || 0);
  const right = Math.ceil(
    m.actualBoundingBoxRight || m.width || fontSize * trimmed.length
  );
  const canvas = document.createElement("canvas");
  canvas.width = (left + right + pad * 2) * scale;
  canvas.height = (ascent + descent + pad * 2) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.font = `${fontSize}px ${SCRIPT_FONT}`;
  ctx.fillStyle = "#16181d";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(trimmed, left + pad, ascent + pad);
  return canvas.toDataURL("image/png");
}

export function AdoptSignatureDialog({
  open,
  onOpenChange,
  kind,
  defaultText,
  onAdopt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "signature" | "initials";
  defaultText: string;
  onAdopt: (pngDataUrl: string, typedText: string | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Keyed on kind: the dialog is reused for signature and initials, and
            each session must start from that kind's default rather than
            inheriting the other one's text or ink. */}
        <AdoptBody
          key={kind}
          kind={kind}
          defaultText={defaultText}
          onOpenChange={onOpenChange}
          onAdopt={onAdopt}
        />
      </DialogContent>
    </Dialog>
  );
}

function AdoptBody({
  kind,
  defaultText,
  onOpenChange,
  onAdopt,
}: {
  kind: "signature" | "initials";
  defaultText: string;
  onOpenChange: (open: boolean) => void;
  onAdopt: (pngDataUrl: string, typedText: string | null) => void;
}) {
  const [typed, setTyped] = useState(defaultText);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [tab, setTab] = useState("type");

  const label = kind === "signature" ? "signature" : "initials";
  // Rasterising is not free, and this renders on every keystroke.
  const typedPng = useMemo(() => typedToPng(typed), [typed]);
  const preview = tab === "type" ? typedPng : drawn;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Adopt your {label}</DialogTitle>
      </DialogHeader>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="type">Type</TabsTrigger>
          <TabsTrigger value="draw">Draw</TabsTrigger>
        </TabsList>
        {/* forceMount: switching tabs must not discard drawn ink. The pad is
              a projection of its stroke model, so being hidden costs nothing. */}
        <TabsContent
          value="type"
          forceMount
          className="space-y-2.5 pt-1 data-[state=inactive]:hidden"
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={
              kind === "signature" ? "Your full name" : "Your initials"
            }
            aria-label={kind === "signature" ? "Full name" : "Initials"}
            autoComplete="name"
            autoFocus
          />
          {/* Rendered at the same 44px the PNG is rasterised at, so the
                preview is the artefact rather than an impression of it. */}
          <div className="flex h-32 items-center justify-center overflow-hidden rounded-md border bg-white px-4">
            {typed.trim() ? (
              <span
                className="whitespace-nowrap leading-normal text-[#16181d]"
                style={{ fontFamily: SCRIPT_FONT, fontSize: 44 }}
              >
                {typed.trim()}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Type your {label} above
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Shown at the size it will be applied. It is scaled to fit each
            field.
          </p>
        </TabsContent>
        <TabsContent
          value="draw"
          forceMount
          className="pt-1 data-[state=inactive]:hidden"
        >
          <SignaturePad onChange={setDrawn} />
        </TabsContent>
      </Tabs>
      <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
        By adopting {kind === "signature" ? "a signature" : "initials"}, you
        agree it is the electronic representation of your {label} for use on
        this document.
      </p>
      <DialogFooter>
        <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          size="lg"
          disabled={!preview}
          onClick={() => {
            if (preview) {
              onAdopt(preview, tab === "type" ? typed.trim() : null);
              onOpenChange(false);
            }
          }}
        >
          <Check /> Adopt and apply
        </Button>
      </DialogFooter>
    </>
  );
}
