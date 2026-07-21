import { NextRequest, NextResponse } from "next/server";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDuration } from "@/lib/format";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";

const VIEW_HEADERS = [
  { key: "email", label: "Email" },
  { key: "verified", label: "Verified" },
  { key: "startedAt", label: "Started at" },
  { key: "timeSpent", label: "Time spent" },
  { key: "completedPct", label: "Completed %" },
  { key: "downloaded", label: "Downloaded" },
  { key: "location", label: "Location" },
];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ target: string[] }> }
) {
  const ctx = await requireTeam();
  const { target } = await params;
  const [kind, id] = target;
  const extFilter = externalViews(await teamMemberEmails(ctx.team.id));

  if (kind === "visitors") {
    const members = new Set(await teamMemberEmails(ctx.team.id));
    const viewers = await db.viewer.findMany({
      where: { teamId: ctx.team.id },
      include: { views: { select: { totalDuration: true, startedAt: true, documentId: true } } },
    });
    const rows = viewers
      .filter((v) => !members.has(v.email.toLowerCase()))
      .map((v) => ({
        email: v.email,
        verified: v.verified ? "yes" : "no",
        visits: v.views.length,
        documents: new Set(v.views.map((x) => x.documentId).filter(Boolean)).size,
        timeSpent: formatDuration(
          v.views.reduce((s, x) => s + x.totalDuration, 0)
        ),
        lastSeen:
          v.views
            .reduce<Date | null>(
              (a, x) => (!a || x.startedAt > a ? x.startedAt : a),
              null
            )
            ?.toISOString() ?? "",
      }));
    const csv = toCsv(
      [
        { key: "email", label: "Email" },
        { key: "verified", label: "Verified" },
        { key: "visits", label: "Visits" },
        { key: "documents", label: "Documents" },
        { key: "timeSpent", label: "Time spent" },
        { key: "lastSeen", label: "Last seen" },
      ],
      rows
    );
    return csvResponse("foyer-visitors.csv", csv);
  }

  if (kind === "document" || kind === "dataroom") {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    // Confirm the target belongs to the team before exporting its views.
    const owner =
      kind === "document"
        ? await db.document.findFirst({
            where: { id, teamId: ctx.team.id },
            select: { name: true },
          })
        : await db.dataroom.findFirst({
            where: { id, teamId: ctx.team.id },
            select: { name: true },
          });
    if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const views = await db.view.findMany({
      // Scoped by the ownership check above plus the document/dataroom id.
      where: {
        ...(kind === "document" ? { documentId: id } : { dataroomId: id }),
        ...extFilter,
      },
      orderBy: { startedAt: "desc" },
      take: 5000,
    });
    const rows = views.map((v) => ({
      email: v.viewerEmail ?? "anonymous",
      verified: v.verified ? "yes" : "no",
      startedAt: v.startedAt.toISOString(),
      timeSpent: formatDuration(v.totalDuration),
      completedPct: v.completedPct,
      downloaded: v.downloadedAt ? "yes" : "no",
      location: [v.city, v.country].filter(Boolean).join(", "),
    }));
    const slug = owner.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return csvResponse(`foyer-${slug}-views.csv`, toCsv(VIEW_HEADERS, rows));
  }

  return NextResponse.json({ error: "Unknown export" }, { status: 404 });
}
