import { NextRequest, NextResponse } from "next/server";
import { getObjectStream } from "@/lib/storage";
import { db } from "@/lib/db";
import { contentTypeForFile } from "@/lib/content-type";

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/**
 * Serves brand assets (logos, banners, link/preset preview images) publicly -
 * these are meant to appear in link preview cards and OG tags.
 *
 * Documents share the same bucket and key scheme, so we must NOT serve an
 * arbitrary key just because it happens to be an image: that would leak
 * image-type documents past every link gate. Only keys a team has explicitly
 * designated as a brand/preview image (referenced from Branding, PreviewPreset,
 * or Link) are served.
 */
async function isPublicAssetKey(key: string): Promise<boolean> {
  const [branding, preset, link] = await Promise.all([
    db.branding.findFirst({
      where: {
        OR: [{ logoKey: key }, { bannerKey: key }, { metaImageKey: key }],
      },
      select: { id: true },
    }),
    db.previewPreset.findFirst({
      where: { metaImageKey: key },
      select: { id: true },
    }),
    db.link.findFirst({ where: { metaImageKey: key }, select: { id: true } }),
  ]);
  return !!(branding || preset || link);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fullKey = key.join("/");
  if (!(await isPublicAssetKey(fullKey)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const obj = await getObjectStream(fullKey);
    // The type stored with the object was declared by whoever uploaded it,
    // so it is only believed when it is one of the plain image types. This
    // route is public and on the app's own origin: nothing here may ever be
    // served as a document that can run script.
    const stored = (obj.ContentType ?? "").split(";")[0].trim().toLowerCase();
    const byName = contentTypeForFile(fullKey);
    const contentType = IMAGE_TYPES.has(stored)
      ? stored
      : IMAGE_TYPES.has(byName)
        ? byName
        : null;
    if (!contentType)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bytes = await obj.Body!.transformToByteArray();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600, immutable",
        "x-content-type-options": "nosniff",
        // An SVG logo is fine inside <img>. Opened directly it is a document
        // that could carry script; sandboxed, it cannot run any.
        "content-security-policy":
          "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
