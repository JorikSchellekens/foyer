import { NextRequest, NextResponse } from "next/server";
import { admitApi } from "@/lib/api-rest";
import { visibilityFor } from "@/lib/api-visibility";
import { db } from "@/lib/db";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";

export async function GET(req: NextRequest) {
  const admitted = await admitApi(req, "read");
  if ("response" in admitted) return admitted.response;
  const auth = admitted.principal;
  const v = await visibilityFor(auth);

  // Internal visits (team members opening their own links) are not counted.
  const extFilter = externalViews(await teamMemberEmails(auth.teamId));
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const documents = await db.document.findMany({
    where: {
      AND: [
        v.doc,
        q ? { name: { contains: q.slice(0, 200), mode: "insensitive" } } : {},
      ],
    },
    include: {
      currentVersion: true,
      _count: { select: { views: { where: extFilter }, links: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      numPages: d.currentVersion?.numPages ?? null,
      fileSize: d.currentVersion?.fileSize ?? null,
      version: d.currentVersion?.versionNumber ?? null,
      // Visits through rooms a limited member cannot see are not theirs to count.
      views: v.restricted ? null : d._count.views,
      links: d._count.links,
      updatedAt: d.updatedAt,
    })),
  });
}
