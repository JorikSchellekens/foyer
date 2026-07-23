import "server-only";
import { createHash } from "crypto";
import type { PDFDocument as PDFDocumentType, PDFFont, PDFPage } from "pdf-lib";

// Burns field values into a PDF and appends the certificate of completion.
// Everything visual is either an embedded PNG (drawn/typed signatures arrive
// as data URLs) or Helvetica text, so no font embedding is needed.

export type StampPlacement = {
  kind: "SIGNATURE" | "INITIALS" | "DATE_SIGNED" | "TEXT" | "CHECKBOX" | string;
  page: number; // 1-based
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  pngDataUrl?: string | null;
  text?: string | null;
};

export type CertificateData = {
  requestId: string;
  title: string;
  documentName: string;
  originalHash: string;
  completedAt: Date;
  signers: Array<{
    name: string | null;
    email: string;
    ip: string | null;
    userAgent: string | null;
    viewedAt: Date | null;
    signedAt: Date | null;
  }>;
  events: Array<{
    type: string;
    who: string | null;
    at: Date;
    ip: string | null;
  }>;
};

export function sha256Hex(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

function pngBytes(dataUrl: string): Uint8Array {
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!m) throw new Error("expected a PNG data URL");
  return Buffer.from(m[1], "base64");
}

/** pct rect (top-left origin) -> pdf-lib points (bottom-left origin). */
function rectToPoints(page: PDFPage, p: StampPlacement) {
  const { width, height } = page.getSize();
  return {
    x: p.xPct * width,
    y: height - (p.yPct + p.hPct) * height,
    w: p.wPct * width,
    h: p.hPct * height,
  };
}

/** Largest font size whose text fits the box, capped for sanity. */
function fitFontSize(
  font: PDFFont,
  text: string,
  boxW: number,
  boxH: number
): number {
  let size = Math.min(boxH * 0.8, 24);
  while (size > 4 && font.widthOfTextAtSize(text, size) > boxW) size -= 0.5;
  return size;
}

export async function stampFields(
  pdf: Buffer | Uint8Array,
  placements: StampPlacement[]
): Promise<PDFDocumentType> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const ink = rgb(0.086, 0.094, 0.114); // #16181d

  // Embed each distinct PNG once even when reused across many fields.
  const pngCache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();

  for (const p of placements) {
    const page = pages[p.page - 1];
    if (!page) continue;
    const { x, y, w, h } = rectToPoints(page, p);

    if ((p.kind === "SIGNATURE" || p.kind === "INITIALS") && p.pngDataUrl) {
      let img = pngCache.get(p.pngDataUrl);
      if (!img) {
        img = await doc.embedPng(pngBytes(p.pngDataUrl));
        pngCache.set(p.pngDataUrl, img);
      }
      // Fit inside the box preserving aspect, anchored to bottom-left so the
      // signature sits on the line the sender placed.
      const scale = Math.min(w / img.width, h / img.height);
      page.drawImage(img, {
        x,
        y,
        width: img.width * scale,
        height: img.height * scale,
      });
    } else if (p.kind === "CHECKBOX") {
      const side = Math.min(w, h);
      page.drawRectangle({
        x,
        y,
        width: side,
        height: side,
        borderColor: ink,
        borderWidth: 1,
      });
      if (p.text === "true") {
        const inset = side * 0.2;
        page.drawLine({
          start: { x: x + inset, y: y + inset },
          end: { x: x + side - inset, y: y + side - inset },
          color: ink,
          thickness: 1.4,
        });
        page.drawLine({
          start: { x: x + inset, y: y + side - inset },
          end: { x: x + side - inset, y: y + inset },
          color: ink,
          thickness: 1.4,
        });
      }
    } else if (p.text) {
      const size = fitFontSize(helvetica, p.text, w, h);
      page.drawText(p.text, {
        x,
        y: y + (h - size) / 2,
        size,
        font: helvetica,
        color: ink,
      });
    }
  }
  return doc;
}

const CERT_MARGIN = 54;
const CERT_LINE = 14;

export async function appendCertificate(
  doc: PDFDocumentType,
  cert: CertificateData
): Promise<void> {
  const { StandardFonts, rgb } = await import("pdf-lib");
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.086, 0.094, 0.114);
  const muted = rgb(0.42, 0.44, 0.46);

  const pageSize: [number, number] = [612, 792]; // US Letter
  let page = doc.addPage(pageSize);
  let cursor = pageSize[1] - CERT_MARGIN;

  const newPageIfNeeded = () => {
    if (cursor < CERT_MARGIN + CERT_LINE) {
      page = doc.addPage(pageSize);
      cursor = pageSize[1] - CERT_MARGIN;
    }
  };
  const line = (
    text: string,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}
  ) => {
    newPageIfNeeded();
    // Truncate rather than overflow off the right edge (long user agents).
    const font = opts.font ?? helvetica;
    const size = opts.size ?? 9.5;
    const maxW = pageSize[0] - CERT_MARGIN * 2;
    let t = text;
    while (t.length > 8 && font.widthOfTextAtSize(t, size) > maxW)
      t = `${t.slice(0, -2)}…`;
    page.drawText(t, {
      x: CERT_MARGIN,
      y: cursor,
      size,
      font,
      color: opts.color ?? ink,
    });
    cursor -= opts.gap ?? CERT_LINE;
  };
  const fmt = (d: Date | null) => (d ? d.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—");

  line("Certificate of Completion", { font: bold, size: 18, gap: 26 });
  line(`Envelope ${cert.requestId}`, { color: muted, gap: 18 });
  line(`Title: ${cert.title}`, {});
  line(`Document: ${cert.documentName}`, {});
  line(`Completed: ${fmt(cert.completedAt)}`, {});
  line(`Original document SHA-256: ${cert.originalHash}`, { size: 8, color: muted, gap: 24 });

  line("Signers", { font: bold, size: 12, gap: 18 });
  for (const s of cert.signers) {
    line(`${s.name ?? s.email} <${s.email}>`, { font: bold });
    line(`Viewed: ${fmt(s.viewedAt)}    Signed: ${fmt(s.signedAt)}`, { color: muted });
    line(`IP: ${s.ip ?? "—"}    Device: ${s.userAgent ?? "—"}`, {
      size: 8,
      color: muted,
      gap: 20,
    });
  }

  line("Event history", { font: bold, size: 12, gap: 18 });
  for (const e of cert.events) {
    line(`${fmt(e.at)}  ${e.type.padEnd(10)}  ${e.who ?? ""}${e.ip ? `  (${e.ip})` : ""}`, {
      size: 8.5,
      color: muted,
      gap: 12,
    });
  }
}

/**
 * Cryptographic sealing hook. Identity today; a later phase can swap in a
 * PAdES digital signature (e.g. @signpdf with a team-configured P12 cert)
 * without touching the pipeline - this runs last, after all visual changes.
 */
export async function sealPdf(bytes: Uint8Array): Promise<Uint8Array> {
  return bytes;
}
