import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? 100),
    500
  );
  const views = await db.view.findMany({
    where: { link: { teamId: auth.teamId } },
    include: { link: true, document: true, dataroom: true },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return NextResponse.json({
    views: views.map((v) => ({
      id: v.id,
      email: v.viewerEmail,
      verified: v.verified,
      item: v.document?.name ?? v.dataroom?.name ?? null,
      link: v.link.name,
      startedAt: v.startedAt,
      durationSeconds: v.totalDuration,
      completedPct: v.completedPct,
      downloaded: !!v.downloadedAt,
      country: v.country,
      city: v.city,
      device: v.device,
    })),
  });
}
