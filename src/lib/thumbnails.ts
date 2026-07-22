import "server-only";
import { db } from "@/lib/db";
import { getObjectBuffer, putObject, objectExists } from "@/lib/storage";
import { renderPdfPagesWebp } from "@/lib/pdf-render";

/**
 * Precomputed page thumbnails. Each PDF page is rendered once (pdfium -> WebP)
 * and cached in object storage, so the reading-trajectory rail and hover
 * preview load as plain images instead of rasterising in the browser.
 *
 * Thumbnails are built at upload (fire-and-forget), by the backfill script, or
 * lazily on the first request for a version that has none yet.
 */

export function thumbKey(versionId: string, page: number) {
  return `thumbnails/${versionId}/${page}.webp`;
}

async function readThumb(versionId: string, page: number): Promise<Buffer | null> {
  try {
    return await getObjectBuffer(thumbKey(versionId, page));
  } catch {
    return null;
  }
}

// Dedupe concurrent generations of the same version within this instance, so a
// rail of images arriving together triggers one render pass, not N.
const inflight = new Map<string, Promise<void>>();

export function generateVersionThumbnails(versionId: string): Promise<void> {
  const existing = inflight.get(versionId);
  if (existing) return existing;
  const run = build(versionId).finally(() => inflight.delete(versionId));
  inflight.set(versionId, run);
  return run;
}

async function build(versionId: string): Promise<void> {
  const version = await db.documentVersion.findUnique({
    where: { id: versionId },
    include: { document: { select: { type: true } } },
  });
  if (!version?.fileKey || version.document?.type !== "PDF") return;

  // Only render pages that are missing (idempotent across re-runs / restarts).
  let pages: number[] | null = null;
  if (version.numPages && version.numPages > 0) {
    const all = Array.from({ length: version.numPages }, (_, i) => i + 1);
    const missing: number[] = [];
    for (const p of all) {
      if (!(await objectExists(thumbKey(versionId, p)))) missing.push(p);
    }
    if (missing.length === 0) return;
    pages = missing;
  }

  const pdf = await getObjectBuffer(version.fileKey);
  for await (const { page, webp } of renderPdfPagesWebp(pdf, pages)) {
    await putObject(thumbKey(versionId, page), webp, "image/webp");
  }
}

/** Serve a single page thumbnail, building the version's set on first miss. */
export async function getOrRenderThumb(
  versionId: string,
  page: number
): Promise<Buffer | null> {
  const cached = await readThumb(versionId, page);
  if (cached) return cached;
  await generateVersionThumbnails(versionId);
  return readThumb(versionId, page);
}
