import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { Stat } from "@/components/shell/stat";
import { PageDwell } from "@/components/analytics/page-dwell";
import { MouseHeatmap } from "@/components/analytics/mouse-heatmap";
import { PageHeatmapGridLazy } from "@/components/analytics/page-heatmap-lazy";
import { ImageHeatmap } from "@/components/analytics/image-heatmap";
import { ContentHeatmap } from "@/components/analytics/content-heatmap";
import { linkUrl } from "@/lib/link-helpers";
import { formatDuration, formatDateTime } from "@/lib/format";

export default async function ViewDetailPage({
  params,
}: {
  params: Promise<{ viewId: string }>;
}) {
  const ctx = await requireTeam();
  const { viewId } = await params;
  const view = await db.view.findFirst({
    where: { id: viewId, link: { teamId: ctx.team.id } },
    include: {
      document: { include: { currentVersion: true } },
      dataroom: true,
      link: { include: { domain: true } },
      viewer: true,
      pageViews: { orderBy: { pageNumber: "asc" } },
      mouseBatches: true,
    },
  });
  if (!view) notFound();

  const itemName =
    view.document?.name ??
    (view.dataroom ? `${view.dataroom.name} (index)` : view.link.name);
  const itemHref = view.document
    ? `/documents/${view.document.id}`
    : view.dataroom
      ? `/datarooms/${view.dataroom.id}`
      : null;
  const publicUrl = await linkUrl(view.link);

  // aggregate mouse samples per page
  const samplesByPage = new Map<number, [number, number][]>();
  for (const batch of view.mouseBatches) {
    const arr = samplesByPage.get(batch.pageNumber) ?? [];
    for (const s of batch.samples as [number, number, number][]) {
      arr.push([s[1], s[2]]);
    }
    samplesByPage.set(batch.pageNumber, arr);
  }
  const heatPages = [...samplesByPage.entries()].sort((a, b) => a[0] - b[0]);

  // Render heat over the real page when the viewed file is a PDF: prefer the
  // exact version the visitor saw, fall back to the current one.
  const viewedVersionId =
    view.pageViews.find((p) => p.versionId)?.versionId ??
    view.document?.currentVersion?.id ??
    null;
  const canRenderPages = view.document?.type === "PDF" && !!viewedVersionId;
  const canRenderImage = view.document?.type === "IMAGE" && !!viewedVersionId;
  const canRenderContent =
    (view.document?.type === "DOCX" || view.document?.type === "TEXT") &&
    !!viewedVersionId;

  return (
    <div>
      <div className="border-b px-4 sm:px-8 py-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/visitors" className="hover:text-foreground">
            Visitors
          </Link>
          <ChevronRight className="size-3" />
          {view.viewer ? (
            <Link
              href={`/visitors/${view.viewer.id}`}
              className="hover:text-foreground"
            >
              {view.viewerEmail}
            </Link>
          ) : (
            <span>{view.viewerEmail ?? "Anonymous"}</span>
          )}
          <ChevronRight className="size-3" />
          <span>{formatDateTime(view.startedAt)}</span>
        </div>
        <h1 className="mt-1 font-display text-3xl tracking-tight">
          {itemHref ? (
            <Link
              href={itemHref}
              className="hover:underline hover:decoration-primary/40 hover:underline-offset-4"
            >
              {itemName}
            </Link>
          ) : (
            itemName
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          via{" "}
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline"
          >
            “{view.link.name}” <ExternalLink className="size-3" />
          </a>{" "}
          · {view.browser ?? "unknown browser"} · {view.device ?? "desktop"}
          {view.city || view.country
            ? ` · ${[view.city, view.country].filter(Boolean).join(", ")}`
            : ""}
        </p>
      </div>

      <div className="space-y-8 px-4 sm:px-8 py-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Time spent" value={formatDuration(view.totalDuration)} />
          <Stat
            label="Read"
            value={view.completedPct ? `${view.completedPct}%` : "—"}
          />
          <Stat label="Pages touched" value={view.pageViews.length || "—"} />
          <Stat label="Downloaded" value={view.downloadedAt ? "Yes" : "No"} />
        </div>

        {view.pageViews.length > 0 && (
          <section className="max-w-2xl rounded-lg border bg-card p-5">
            <h2 className="mb-4 font-display text-xl">Time on each page</h2>
            <PageDwell
              pages={view.pageViews.map((p) => ({
                pageNumber: p.pageNumber,
                avgSeconds: p.duration,
                views: 1,
              }))}
            />
          </section>
        )}

        {heatPages.length > 0 && (
          <section>
            <h2 className="mb-1 font-display text-xl">Attention maps</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Where this visitor&apos;s cursor lingered, drawn over the page
              they were reading. Warm areas received repeated attention.
            </p>
            {canRenderPages ? (
              <PageHeatmapGridLazy
                fileUrl={`/api/documents/file/${viewedVersionId}`}
                pages={heatPages.map(([page, samples]) => ({
                  page,
                  samples,
                }))}
              />
            ) : canRenderImage ? (
              <ImageHeatmap
                src={`/api/documents/file/${viewedVersionId}`}
                samples={heatPages.flatMap(([, samples]) => samples)}
              />
            ) : canRenderContent ? (
              <ContentHeatmap
                fileUrl={`/api/documents/file/${viewedVersionId}`}
                kind={view.document!.type as "DOCX" | "TEXT"}
                samples={heatPages.flatMap(([, samples]) => samples)}
              />
            ) : (
              <div className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-4">
                {heatPages.map(([page, samples]) => (
                  <figure key={page}>
                    <MouseHeatmap samples={samples} />
                    <figcaption className="mt-1.5 text-center font-mono text-xs text-muted-foreground">
                      Page {page} · {samples.length} samples
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}

        {view.pageViews.length === 0 && heatPages.length === 0 && (
          <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            No page-level detail for this visit yet. It appears once the
            visitor spends time inside the document.
          </p>
        )}
      </div>
    </div>
  );
}
