import "server-only";
import type { DocumentType, DocumentVersion } from "@prisma/client";
import { getObjectBuffer, newFileKey, putObject } from "@/lib/storage";

// Converts non-PDF documents into a PDF rendition so the signing engine only
// ever deals with PDFs (DocuSign does the same at preparation time). The
// rendition is generated once at draft creation and pinned on the request;
// the sender reviews it in the field editor before anything is sent.
//
// Conversions are deliberately browser-free (the production image has no
// chromium): images embed at full fidelity; Word, spreadsheets and text
// become typeset text - content-faithful, formatting-lossy.

export const SIGNABLE_TYPES: DocumentType[] = [
  "PDF",
  "IMAGE",
  "DOCX",
  "SHEET",
  "TEXT",
];

export function isSignable(type: DocumentType): boolean {
  return SIGNABLE_TYPES.includes(type);
}

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 54;

/** Standard PDF fonts only speak WinAnsi; keep layout from throwing. */
function sanitize(text: string): string {
  return text
    .replace(/\t/g, "    ")
    .replace(/[^\x20-\x7E\xA0-\xFF\r\n]/g, "?");
}

async function textToPdf(
  text: string,
  opts: { mono?: boolean; size?: number } = {}
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(
    opts.mono ? StandardFonts.Courier : StandardFonts.Helvetica
  );
  const size = opts.size ?? 11;
  const lineH = size * 1.45;
  const maxW = PAGE_W - MARGIN * 2;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const writeLine = (line: string) => {
    if (y < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    if (line) page.drawText(line, { x: MARGIN, y, size, font });
    y -= lineH;
  };

  for (const raw of sanitize(text).split(/\r?\n/)) {
    let rest = raw;
    if (!rest) writeLine("");
    while (rest) {
      let cut = rest.length;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxW)
        cut = Math.floor(cut * 0.9);
      if (cut < rest.length) {
        const sp = rest.lastIndexOf(" ", cut);
        if (sp > cut * 0.5) cut = sp;
      }
      writeLine(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
  }
  return doc.save();
}

async function imageToPdf(buf: Buffer): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  // Normalize every format sharp understands (webp/gif/avif/svg...) to PNG.
  const png = await sharp(buf).png().toBuffer();
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(png);
  // One page shaped like the image, capped to letter width for huge photos.
  const scale = Math.min(1, PAGE_W / img.width);
  const page = doc.addPage([img.width * scale, img.height * scale]);
  page.drawImage(img, {
    x: 0,
    y: 0,
    width: img.width * scale,
    height: img.height * scale,
  });
  return doc.save();
}

async function docxToPdf(buf: Buffer): Promise<Uint8Array> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return textToPdf(value);
}

async function sheetToPdf(buf: Buffer): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    if (wb.SheetNames.length > 1) parts.push(`=== ${name} ===`, "");
    parts.push(XLSX.utils.sheet_to_csv(wb.Sheets[name]), "");
  }
  return textToPdf(parts.join("\n"), { mono: true, size: 9 });
}

/**
 * The storage key of the PDF a signature request should pin. PDFs pass
 * through untouched; other signable types get a rendition stored under the
 * team's prefix. Throws for types that cannot be signed.
 */
export async function signablePdfKey(
  teamId: string,
  type: DocumentType,
  version: Pick<DocumentVersion, "fileKey" | "fileName">
): Promise<string> {
  if (!version.fileKey) throw new Error("Document file is missing.");
  if (type === "PDF") return version.fileKey;
  if (!isSignable(type))
    throw new Error("This file type cannot be sent for signature.");

  const buf = await getObjectBuffer(version.fileKey);
  const pdf =
    type === "IMAGE"
      ? await imageToPdf(buf)
      : type === "DOCX"
        ? await docxToPdf(buf)
        : type === "SHEET"
          ? await sheetToPdf(buf)
          : await textToPdf(buf.toString("utf8"), { mono: true, size: 10 });

  const base = version.fileName.replace(/\.[^.]+$/, "");
  const key = newFileKey(teamId, `${base} (for signing).pdf`);
  await putObject(key, pdf, "application/pdf");
  return key;
}
