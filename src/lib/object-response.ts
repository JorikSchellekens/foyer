import { NextResponse } from "next/server";
import { getObjectStream } from "@/lib/storage";

/**
 * Stream a stored object as an HTTP response. Honours Range on inline
 * responses: video/audio need it for seeking, and pdf.js needs it to fetch
 * large PDFs in chunks. (We advertise accept-ranges: bytes, so a client that
 * sends Range must get a 206 back.)
 */
export async function streamObject(
  key: string,
  contentType: string,
  opts: { disposition: string; range?: string | null }
) {
  try {
    const obj = await getObjectStream(key, opts.range ?? undefined);
    const headers: Record<string, string> = {
      "content-type": contentType,
      "content-disposition": opts.disposition,
      "cache-control": "private, max-age=600",
      "x-content-type-options": "nosniff",
      "accept-ranges": "bytes",
    };
    if (obj.ContentLength != null)
      headers["content-length"] = String(obj.ContentLength);
    if (obj.ContentRange) headers["content-range"] = obj.ContentRange;
    return new NextResponse(obj.Body!.transformToWebStream(), {
      status: opts.range && obj.ContentRange ? 206 : 200,
      headers,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
