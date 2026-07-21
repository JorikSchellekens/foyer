import { NextRequest, NextResponse } from "next/server";
import { getObjectStream } from "@/lib/storage";
import { db } from "@/lib/db";

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
    const contentType = obj.ContentType ?? "application/octet-stream";
    if (!contentType.startsWith("image/"))
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bytes = await obj.Body!.transformToByteArray();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
