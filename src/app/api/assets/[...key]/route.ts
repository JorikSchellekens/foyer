import { NextRequest, NextResponse } from "next/server";
import { getObjectStream } from "@/lib/storage";

/**
 * Serves stored brand assets (logos, banners, link preview images).
 * Keys contain 16 hex chars of entropy, so URLs are unguessable; documents
 * themselves are never served here.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fullKey = key.join("/");
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
