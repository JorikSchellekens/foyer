import { NextRequest, NextResponse } from "next/server";
import { admitApi } from "@/lib/api-rest";
import { visibilityFor } from "@/lib/api-visibility";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const admitted = await admitApi(req, "read");
  if ("response" in admitted) return admitted.response;
  const auth = admitted.principal;
  const v = await visibilityFor(auth);

  // Whole number between 1 and 500; anything else falls back to 100. A
  // negative "take" would otherwise mean "the last N", with no ceiling.
  const asked = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Number.isInteger(asked) && asked >= 1 ? Math.min(asked, 500) : 100;
  const views = await db.view.findMany({
    where: v.view,
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
