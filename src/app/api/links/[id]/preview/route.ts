import { NextRequest, NextResponse } from "next/server";
import { requireTeam, signPayload } from "@/lib/auth";
import { db } from "@/lib/db";
import { linkUrl } from "@/lib/link-helpers";

/**
 * Mint a short-lived owner-preview token for one of the team's links and
 * bounce to its public URL with ?preview= attached. The viewer then renders
 * the real visitor experience with every gate open and nothing recorded.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await requireTeam();

  const link = await db.link.findFirst({
    where: { id, teamId: ctx.team.id },
    include: { domain: true },
  });
  if (!link) return new NextResponse("Not found", { status: 404 });

  const token = await signPayload({ preview: true, lid: link.id }, "15m");
  const url = new URL(await linkUrl(link));
  url.searchParams.set("preview", token);
  return NextResponse.redirect(url.toString());
}
