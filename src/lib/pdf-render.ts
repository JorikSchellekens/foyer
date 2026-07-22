import sharp from "sharp";
import { PDFiumLibrary } from "@hyzyla/pdfium";

/**
 * Pure PDF page -> WebP rendering (pdfium + sharp). No storage or db, and no
 * "server-only" marker, so both the server thumbnail lib and the standalone
 * backfill script can share it.
 */

export const THUMB_WIDTH = 360; // output width; one size serves rail + hover
export const MAX_THUMB_PAGES = 500;

/**
 * Render the given 1-indexed pages (or all pages when `pages` is null) of a PDF
 * to WebP buffers, yielding one at a time so callers can stream to storage.
 */
export async function* renderPdfPagesWebp(
  pdf: Buffer,
  pages: number[] | null,
  width = THUMB_WIDTH
): AsyncGenerator<{ page: number; webp: Buffer }> {
  const library = await PDFiumLibrary.init();
  try {
    const doc = await library.loadDocument(pdf);
    try {
      const count = Math.min(doc.getPageCount(), MAX_THUMB_PAGES);
      const list = (pages ?? Array.from({ length: count }, (_, i) => i + 1))
        .filter((p) => p >= 1 && p <= count)
        .sort((a, b) => a - b);
      for (const p of list) {
        const page = doc.getPage(p - 1);
        const { originalWidth } = page.getOriginalSize();
        const scale = Math.min(3, Math.max(1, (width * 1.5) / originalWidth));
        const image = await page.render({
          scale,
          render: (o) =>
            sharp(o.data, {
              raw: { width: o.width, height: o.height, channels: 4 },
            })
              .resize({ width, withoutEnlargement: true })
              .webp({ quality: 80 })
              .toBuffer(),
        });
        yield { page: p, webp: Buffer.from(image.data) };
      }
    } finally {
      doc.destroy();
    }
  } finally {
    library.destroy();
  }
}
