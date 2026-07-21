import { NextResponse } from "next/server";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";

/** Link ids with a view active in the last 30 seconds - "someone is reading now". */
export async function GET() {
  const ctx = await requireTeam();
  const since = new Date(Date.now() - 30_000);
  const active = await db.view.findMany({
    where: { link: { teamId: ctx.team.id }, lastActiveAt: { gt: since } },
    select: { linkId: true },
    distinct: ["linkId"],
  });
  return NextResponse.json(
    { linkIds: active.map((v) => v.linkId) },
    { headers: { "cache-control": "no-store" } }
  );
}
