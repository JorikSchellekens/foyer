import { z } from "zod";

// Shared vocabulary for placed signature fields. Used by the sender's
// placement editor, the signer's fill UI, and the server-side stamper, so all
// three agree on kinds and the pct-rect coordinate space (fractions of page
// size, origin top-left - the same shape documented on Agreement.fields).

export const FIELD_KINDS = [
  "SIGNATURE",
  "INITIALS",
  "DATE_SIGNED",
  "TEXT",
  "CHECKBOX",
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_LABELS: Record<FieldKind, string> = {
  SIGNATURE: "Signature",
  INITIALS: "Initials",
  DATE_SIGNED: "Date signed",
  TEXT: "Text",
  CHECKBOX: "Checkbox",
};

// Default box sizes as fractions of page width/height, tuned for A4/Letter.
export const FIELD_DEFAULT_SIZE: Record<FieldKind, { wPct: number; hPct: number }> = {
  SIGNATURE: { wPct: 0.22, hPct: 0.05 },
  INITIALS: { wPct: 0.07, hPct: 0.04 },
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
});

export const placedFieldSchema = fieldRectSchema.extend({
  id: z.string().optional(),
  signerId: z.string(),
});

export type PlacedField = z.infer<typeof placedFieldSchema>;

// Distinct tints so each recipient's fields are tellable apart in the editor.
// Index by the signer's position in the recipients list.
export const SIGNER_COLORS = [
  { border: "#175B47", bg: "rgba(23,91,71,0.12)" },
  { border: "#1D4ED8", bg: "rgba(29,78,216,0.10)" },
  { border: "#93321F", bg: "rgba(147,50,31,0.10)" },
  { border: "#7C3AED", bg: "rgba(124,58,237,0.10)" },
  { border: "#B45309", bg: "rgba(180,83,9,0.10)" },
  { border: "#0E7490", bg: "rgba(14,116,144,0.10)" },
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
 * entered so far plus whether a signature/initials image has been adopted.
 * DATE_SIGNED is stamped server-side at submit time, so it never blocks.
 */
export function missingRequiredFields(
  fields: FillableField[],
  filled: Record<string, string>,
  adopted: { signature: boolean; initials: boolean }
): FillableField[] {
  return fields.filter((f) => {
    if (!f.required) return false;
    switch (f.kind) {
      case "SIGNATURE":
        return !adopted.signature;
      case "INITIALS":
        return !adopted.initials;
      case "DATE_SIGNED":
        return false;
      case "CHECKBOX":
        return false; // an unchecked box is a valid answer
      default:
        return !(filled[f.id] ?? f.value ?? "").trim();
    }
  });
}
