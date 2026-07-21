import { NextRequest, NextResponse } from "next/server";
import { resolveLink } from "@/lib/access";
import { getObjectStream } from "@/lib/storage";

/** Serves the NDA PDF so visitors can read it before signing. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const host = req.headers.get("host") ?? "";
  const link = await resolveLink(host, slug);
  if (!link?.agreement?.fileKey)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const obj = await getObjectStream(link.agreement.fileKey);
    return new NextResponse(obj.Body!.transformToWebStream(), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "inline",
        "cache-control": "private, max-age=600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
