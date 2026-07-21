import Link from "next/link";
import { ArrowRight, Eye, FileText, FolderLock, Link2, Users } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Stat } from "@/components/shell/stat";
import { linkUrl } from "@/lib/link-helpers";
import { VisitsChart } from "@/components/analytics/visits-chart";
import { ViewsTable } from "@/components/analytics/views-table";
import { HotLeads } from "@/components/analytics/hot-leads";
import { AccessRequests } from "@/components/analytics/access-requests";
import { hotLeads } from "@/lib/analytics";
import { formatDuration } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const ctx = await requireTeam();
  const teamId = ctx.team.id;
  const since30 = new Date(Date.now() - 30 * 86400_000);

  const [docCount, dataroomCount, linkCount, viewerCount, recentViews, views30] =
    await Promise.all([
      db.document.count({ where: { teamId } }),
      db.dataroom.count({ where: { teamId } }),
      db.link.count({ where: { teamId, isArchived: false } }),
      db.viewer.count({ where: { teamId } }),
      db.view.findMany({
        where: { link: { teamId } },
        orderBy: { startedAt: "desc" },
        take: 12,
        include: {
          link: { include: { domain: true } },
          document: true,
          dataroom: true,
        },
      }),
      db.view.findMany({
        where: { link: { teamId }, startedAt: { gt: since30 } },
        select: { startedAt: true, totalDuration: true },
      }),
    ]);

  const byDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    byDay.set(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10), 0);
  }
  for (const v of views30) {
    const key = v.startedAt.toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const totalTime30 = views30.reduce((s, v) => s + v.totalDuration, 0);

  const isEmpty = docCount === 0 && dataroomCount === 0;
  const leads = isEmpty ? [] : await hotLeads(teamId);
  const accessRequests = await db.accessRequest.findMany({
    where: { teamId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { link: { select: { name: true } } },
  });

  return (
    <div>
      <PageHeader
        title={ctx.team.name}
        description="What your visitors have been reading."
      />
      <div className="space-y-8 px-4 sm:px-8 py-6">
        {isEmpty ? (
          <div className="rounded-lg border border-dashed px-4 sm:px-8 py-16">
            <h2 className="font-display text-3xl tracking-tight">
              Welcome to Foyer
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Three steps to your first tracked share:
            </p>
            <ol className="mt-6 max-w-md space-y-4">
              {[
                {
                  href: "/documents",
                  title: "Upload documents",
                  caption: "Drop in a deck, a folder, or a whole directory tree.",
                  icon: FileText,
                },
                {
                  href: "/datarooms",
                  title: "Assemble a data room",
                  caption: "Curate files behind one branded link, with permissions.",
                  icon: FolderLock,
                },
                {
                  href: "/links",
                  title: "Share and watch",
                  caption: "Page-by-page reading time, per visitor, in real time.",
                  icon: Eye,
                },
              ].map((step, i) => (
                <li key={step.href}>
                  <Link
                    href={step.href}
                    className="group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                  >
                    <span className="font-mono text-sm text-primary">
                      0{i + 1}
                    </span>
                    <step.icon
                      className="size-4 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">
                        {step.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {step.caption}
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <>
            <AccessRequests
              requests={accessRequests.map((r) => ({
                id: r.id,
                email: r.email,
                note: r.note,
                linkName: r.link.name,
                createdAt: r.createdAt.toISOString(),
              }))}
            />

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Stat label="Documents" value={docCount} />
              <Stat label="Data rooms" value={dataroomCount} />
              <Stat label="Active links" value={linkCount} />
              <Stat label="Visitors" value={viewerCount} />
              <Stat
                label="Time read · 30d"
                value={formatDuration(totalTime30)}
              />
            </div>

            <HotLeads leads={leads} />

            <div className="rounded-lg border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">Visits, last 30 days</h2>
                <Link
                  href="/visitors"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Users className="size-3.5" /> All visitors
                </Link>
              </div>
              <VisitsChart
                data={[...byDay.entries()].map(([date, visits]) => ({
                  date,
                  visits,
                }))}
              />
            </div>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl">Latest visits</h2>
                <Link
                  href="/links"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Link2 className="size-3.5" /> Manage links
                </Link>
              </div>
              <ViewsTable
                showItem
                rows={await Promise.all(
                  recentViews.map(async (v) => ({
                    id: v.id,
                    viewerId: v.viewerId,
                    email: v.viewerEmail,
                    verified: v.verified,
                    linkName: v.link.name,
                    linkUrl: await linkUrl(v.link),
                    itemName: v.document?.name ?? v.dataroom?.name ?? null,
                    itemHref: v.document
                      ? `/documents/${v.document.id}`
                      : v.dataroom
                        ? `/datarooms/${v.dataroom.id}`
                        : null,
                    duration: v.totalDuration,
                    completedPct: v.completedPct || null,
                    device: v.device,
                    browser: v.browser,
                    country: v.country,
                    city: v.city,
                    startedAt: v.startedAt.toISOString(),
                    downloaded: !!v.downloadedAt,
                  }))
                )}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
