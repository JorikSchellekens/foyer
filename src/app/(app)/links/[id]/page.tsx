import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  ExternalLink,
  FileText,
  FolderLock,
} from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/shell/stat";
import { CopyButton } from "@/components/shell/copy-button";
import { ViewsTable } from "@/components/analytics/views-table";
import { PageDwell } from "@/components/analytics/page-dwell";
import { linkUrl } from "@/lib/link-helpers";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";
import { formatDuration } from "@/lib/format";

export default async function LinkAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTeam();
  const { id } = await params;

  // A team member opening their own link is excluded from every count.
  const extFilter = externalViews(await teamMemberEmails(ctx.team.id));

  const link = await db.link.findFirst({
    where: { id, teamId: ctx.team.id },
    include: {
      domain: true,
      document: true,
      dataroom: true,
      views: {
        where: extFilter,
        orderBy: { startedAt: "desc" },
        take: 100,
        include: {
          viewer: true,
          document: { select: { id: true, name: true } },
          pageViews: true,
        },
      },
    },
  });
  if (!link) notFound();

  const isDataroom = link.target === "DATAROOM";
  const targetName = link.dataroom?.name ?? link.document?.name ?? "Untitled";
  const targetHref = isDataroom
    ? link.dataroomId
      ? `/datarooms/${link.dataroomId}`
      : null
    : link.documentId
      ? `/documents/${link.documentId}`
      : null;
  const url = await linkUrl(link);

  const totalTime = link.views.reduce((s, v) => s + v.totalDuration, 0);
  const uniqueEmails = new Set(
    link.views.map((v) => v.viewerEmail).filter(Boolean)
  );
  const downloads = link.views.filter((v) => v.downloadedAt).length;

  // Per-page reading time only reads cleanly for a single-document link;
  // across a data room, page numbers from different documents would collide.
  const pageAgg = new Map<number, { total: number; count: number }>();
  if (!isDataroom) {
    for (const v of link.views) {
      for (const pv of v.pageViews) {
        const agg = pageAgg.get(pv.pageNumber) ?? { total: 0, count: 0 };
        agg.total += pv.duration;
        agg.count += 1;
        pageAgg.set(pv.pageNumber, agg);
      }
    }
  }
  const pages = [...pageAgg.entries()]
    .map(([pageNumber, agg]) => ({
      pageNumber,
      avgSeconds: agg.total / agg.count,
      views: agg.count,
    }))
    .sort((a, b) => a.pageNumber - b.pageNumber);

  return (
    <div>
      <div className="border-b px-4 sm:px-8 py-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/links" className="hover:text-foreground">
            Links
          </Link>
          <ChevronRight className="size-3" />
          <span>{link.name}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl tracking-tight">{link.name}</h1>
          {link.isArchived && <Badge variant="secondary">Inactive</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          {targetHref ? (
            <Link
              href={targetHref}
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              {isDataroom ? (
                <FolderLock className="size-3.5" />
              ) : (
                <FileText className="size-3.5" />
              )}
              {targetName}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {targetName}
            </span>
          )}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-mono text-xs hover:text-foreground hover:underline"
            >
              {url.replace(/^https?:\/\//, "")}
              <ExternalLink className="size-3" />
            </a>
            <CopyButton value={url} />
          </span>
        </div>
      </div>

      <div className="space-y-8 px-4 sm:px-8 py-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Views" value={link.views.length} />
          <Stat label="Unique visitors" value={uniqueEmails.size} />
          <Stat label="Total time" value={formatDuration(totalTime)} />
          <Stat
            label="Avg time"
            value={formatDuration(
              link.views.length ? totalTime / link.views.length : 0
            )}
          />
        </div>

        {pages.length > 0 && (
          <section className="max-w-2xl rounded-lg border bg-card p-5">
            <h2 className="mb-4 font-display text-xl">Reading time by page</h2>
            <PageDwell pages={pages} />
          </section>
        )}

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl">Who viewed this link</h2>
            {downloads > 0 && (
              <span className="text-xs text-muted-foreground">
                {downloads} download{downloads === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <ViewsTable
            showItem={isDataroom}
            rows={link.views.map((v) => ({
              id: v.id,
              viewerId: v.viewerId,
              email: v.viewerEmail,
              verified: v.verified,
              linkName: link.name,
              linkUrl: url,
              itemName: v.document?.name ?? targetName,
              itemHref: v.document ? `/documents/${v.document.id}` : targetHref,
              duration: v.totalDuration,
              completedPct: v.completedPct,
              device: v.device,
              browser: v.browser,
              country: v.country,
              city: v.city,
              startedAt: v.startedAt.toISOString(),
              downloaded: !!v.downloadedAt,
            }))}
          />
        </section>
      </div>
    </div>
  );
}
