import { z } from "zod";

// Shared vocabulary for placed signature fields. Used by the sender's
// placement editor, the signer's fill UI, and the server-side stamper, so all
// three agree on kinds and the pct-rect coordinate space (fractions of page
// size, origin top-left - the same shape documented on Agreement.fields).

export const FIELD_KINDS = [
  "SIGNATURE",
  "INITIALS",
  "NAME",
  "DATE_SIGNED",
  "TEXT",
  "CHECKBOX",
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_LABELS: Record<FieldKind, string> = {
  SIGNATURE: "Signature",
  INITIALS: "Initials",
  NAME: "Name",
  DATE_SIGNED: "Date signed",
  TEXT: "Text",
  CHECKBOX: "Checkbox",
};

export const FIELD_ALIGNS = ["LEFT", "CENTER", "RIGHT"] as const;
export type FieldAlign = (typeof FIELD_ALIGNS)[number];

/** Kinds that carry text and therefore an alignment. */
export function hasAlignment(kind: FieldKind | string): boolean {
  return kind === "NAME" || kind === "DATE_SIGNED" || kind === "TEXT";
}

// Default box sizes as fractions of page width/height, tuned for A4/Letter.
export const FIELD_DEFAULT_SIZE: Record<FieldKind, { wPct: number; hPct: number }> = {
  SIGNATURE: { wPct: 0.22, hPct: 0.05 },
  INITIALS: { wPct: 0.07, hPct: 0.04 },
  NAME: { wPct: 0.2, hPct: 0.03 },
  DATE_SIGNED: { wPct: 0.14, hPct: 0.03 },
  TEXT: { wPct: 0.2, hPct: 0.03 },
  CHECKBOX: { wPct: 0.025, hPct: 0.018 },
};

export const fieldRectSchema = z.object({
  kind: z.enum(FIELD_KINDS),
  page: z.number().int().min(1),
  xPct: z.number().min(0).max(1),
  yPct: z.number().min(0).max(1),
  wPct: z.number().min(0.005).max(1),
  hPct: z.number().min(0.005).max(1),
  required: z.boolean().default(true),
  align: z.enum(FIELD_ALIGNS).default("LEFT"),
});

export const placedFieldSchema = fieldRectSchema.extend({
  id: z.string().optional(),
  signerId: z.string(),
});

export type PlacedField = z.infer<typeof placedFieldSchema>;

// ---- text metrics shared by the on-screen fill and the PDF stamp ----
//
// Both renderers size text with the same rule so what the signer sees while
// filling is what ends up burned into the PDF: the largest size that fits the
// box height (capped), shrunk until the string fits the width. All dimensions
// are PDF points; the client scales the result to rendered pixels.

/** Largest font size in points, capped for sanity. */
export const MAX_FIELD_FONT_PT = 24;
/** Horizontal breathing room inside a text box, in points, each side. */
export const TEXT_INSET_PT = 2;

export function fitFontSize(
  measure: (text: string, size: number) => number,
  text: string,
  boxW: number,
  boxH: number
): number {
  const avail = Math.max(1, boxW - TEXT_INSET_PT * 2);
  let size = Math.min(boxH * 0.8, MAX_FIELD_FONT_PT);
  while (size > 4 && measure(text, size) > avail) size -= 0.5;
  return size;
}

/** Left edge of text inside a box, honouring the field's alignment. */
export function alignedTextX(
  align: FieldAlign | string,
  boxX: number,
  boxW: number,
  textW: number
): number {
  switch (align) {
    case "CENTER":
      return boxX + (boxW - textW) / 2;
    case "RIGHT":
      return boxX + boxW - TEXT_INSET_PT - textW;
    default:
      return boxX + TEXT_INSET_PT;
  }
}

// Distinct tints so each recipient's fields are tellable apart in the editor.
// Index by the signer's position in the recipients list.
/*
 * Signers have to be told apart at a glance on a dense page, so this is the one
 * place the palette runs to more than a single accent. It stays inside the
 * paper-and-ink family: library green first, then muted archival tones. No
 * saturated primaries, no purple.
 */
export const SIGNER_COLORS = [
  { border: "#175B47", bg: "rgba(23,91,71,0.12)" },
  { border: "#1F3A5F", bg: "rgba(31,58,95,0.10)" },
  { border: "#93321F", bg: "rgba(147,50,31,0.10)" },
  { border: "#5A5433", bg: "rgba(90,84,51,0.12)" },
  { border: "#2F6E6A", bg: "rgba(47,110,106,0.10)" },
  { border: "#6B4A2F", bg: "rgba(107,74,47,0.10)" },
];

export function signerColor(index: number) {
  return SIGNER_COLORS[index % SIGNER_COLORS.length];
}

type FillableField = {
  id: string;
  kind: FieldKind | string;
  required: boolean;
  value: string | null;
};

/**
 * Which of a signer's required fields are still unfilled, given the values
 * entered so far plus what the signer has adopted (signature and initials
 * images, full name). DATE_SIGNED is stamped server-side at submit time, so
 * it never blocks. NAME draws on the signer-level name, like SIGNATURE draws
 * on the adopted image: one entry fills every NAME box.
 */
export function missingRequiredFields(
  fields: FillableField[],
  filled: Record<string, string>,
  adopted: { signature: boolean; initials: boolean; name?: string | null }
): FillableField[] {
  return fields.filter((f) => {
    if (!f.required) return false;
    switch (f.kind) {
      case "SIGNATURE":
        return !adopted.signature;
      case "INITIALS":
        return !adopted.initials;
      case "NAME":
        return !(adopted.name ?? "").trim();
      case "DATE_SIGNED":
        return false;
      case "CHECKBOX":
        return false; // an unchecked box is a valid answer
      default:
        return !(filled[f.id] ?? f.value ?? "").trim();
    }
  });
}
