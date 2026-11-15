import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getViewerSession, setViewerSession } from "@/lib/access";
import { originFromRequest } from "@/lib/origin";

/** Personal invite links: prove email ownership by possession of the token. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const recipient = await db.linkRecipient.findUnique({
    where: { token },
    include: { link: { include: { domain: true } } },
  });

  const origin = originFromRequest(req);
  if (!recipient)
    return NextResponse.redirect(`${origin}/view/expired`);
  if (recipient.expiresAt && recipient.expiresAt < new Date())
    return NextResponse.redirect(`${origin}/view/expired`);

  const link = recipient.link;
  const session = await getViewerSession(link.id);
  await setViewerSession({
    ...session,
    linkId: link.id,
    email: recipient.email,
    verified: true,
  });

  const isCustom = link.domainId !== null && link.domain;
  const room = isCustom
    ? `https://${link.domain!.domain}/${link.slug}`
    : `${origin}/view/${link.slug}`;
  // ?d=<itemId> opens one document of the room instead of its index.
  const itemId = req.nextUrl.searchParams.get("d");
  return NextResponse.redirect(
    itemId && /^[A-Za-z0-9_-]{1,64}$/.test(itemId)
      ? `${room}/d/${itemId}`
      : room
  );
}
