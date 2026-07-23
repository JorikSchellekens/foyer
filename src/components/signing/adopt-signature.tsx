"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
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
  if (!trimmed) return null;
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
  const [typed, setTyped] = useState(defaultText);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [tab, setTab] = useState("type");

  const label = kind === "signature" ? "signature" : "initials";
  const preview = tab === "type" ? typedToPng(typed) : drawn;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adopt your {label}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="type">Type</TabsTrigger>
            <TabsTrigger value="draw">Draw</TabsTrigger>
          </TabsList>
          <TabsContent value="type" className="space-y-3 pt-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={kind === "signature" ? "Your full name" : "Your initials"}
              autoFocus
            />
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-md border bg-white">
              {typed.trim() ? (
                <span
                  className="px-4 text-4xl text-[#16181d]"
                  style={{ fontFamily: SCRIPT_FONT }}
                >
                  {typed.trim()}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Type your {label} above
                </span>
              )}
            </div>
          </TabsContent>
          <TabsContent value="draw" className="pt-2">
            <SignaturePad onChange={setDrawn} />
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          By adopting {kind === "signature" ? "a signature" : "initials"}, you
          agree it is the electronic representation of your {label} for use on
          this document.
        </p>
        <Button
          disabled={!preview}
          onClick={() => {
            if (preview) {
              onAdopt(preview, tab === "type" ? typed.trim() : null);
              onOpenChange(false);
            }
          }}
        >
          Adopt and apply
        </Button>
      </DialogContent>
    </Dialog>
  );
}
