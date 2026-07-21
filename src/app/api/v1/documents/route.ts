import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";

export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Internal visits (team members opening their own links) are not counted.
  const extFilter = externalViews(await teamMemberEmails(auth.teamId));
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const documents = await db.document.findMany({
    where: {
      teamId: auth.teamId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
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
      views: d._count.views,
      links: d._count.links,
      updatedAt: d.updatedAt,
    })),
  });
}
