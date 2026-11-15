import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consumeVerificationToken } from "@/lib/tokens";
import { getViewerSession, setViewerSession } from "@/lib/access";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const home = new URL("/", req.url);
  if (!token) return NextResponse.redirect(home);

  const record = await consumeVerificationToken(token, "VIEWER_VERIFY");
  if (!record)
    return NextResponse.redirect(
      new URL(`/view/expired`, req.url)
    );

  const context = record.context as {
    linkId?: string;
    slug?: string;
    name?: string | null;
    itemId?: string | null;
  } | null;
  if (!context?.linkId || !context.slug) return NextResponse.redirect(home);

  const link = await db.link.findUnique({ where: { id: context.linkId } });
  if (!link) return NextResponse.redirect(home);

  const session = await getViewerSession(link.id);
  await setViewerSession({
    ...session,
    linkId: link.id,
    email: record.email,
    name: context.name ?? session.name,
    verified: true,
  });

  // On custom domains the public path has no /view prefix.
  const host = req.headers.get("host") ?? "";
  const isCustom = link.domainId !== null;
  const room = isCustom ? `/${link.slug}` : `/view/${link.slug}`;
  // The visitor asked for one document of the room: send them back to it.
  const path = context.itemId
    ? `${room}/d/${encodeURIComponent(context.itemId)}`
    : room;
  return NextResponse.redirect(new URL(path, `${req.nextUrl.protocol}//${host}`));
}
