import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Link2, Plus } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/shell/stat";
import { FileIcon } from "@/components/shell/file-icon";
import { EmptyState } from "@/components/shell/empty-state";
import { LinkEditor } from "@/components/links/link-editor";
import { LinksTable } from "@/components/links/links-table";
import { ViewsTable } from "@/components/analytics/views-table";
import { ExportButton } from "@/components/shell/export-button";
import { PageDwell } from "@/components/analytics/page-dwell";
import { getEditorContext, toEditorLink, linkUrl } from "@/lib/link-helpers";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";
import {
  formatBytes,
  formatDuration,
  formatDateTime,
  timeAgo,
} from "@/lib/format";
import { docTypeLabel } from "@/lib/doc-types";
import { VersionUploadButton, RestoreVersionButton } from "./version-upload";
import { DocumentTitle } from "./title-editor";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTeam();
  const { id } = await params;

  // Internal visits (a team member opening their own link) are excluded from
  // the counts and the recent-views list.
  const extFilter = externalViews(await teamMemberEmails(ctx.team.id));

  const doc = await db.document.findFirst({
    where: { id, teamId: ctx.team.id },
    include: {
      currentVersion: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { uploadedBy: true },
      },
      links: {
        include: {
          domain: true,
          permissions: true,
          recipients: true,
          views: {
            where: extFilter,
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { startedAt: true },
          },
          _count: { select: { views: { where: extFilter } } },
        },
        orderBy: { createdAt: "desc" },
      },
      views: {
        where: extFilter,
        orderBy: { startedAt: "desc" },
        take: 50,
        include: {
          viewer: true,
          link: { include: { domain: true } },
          pageViews: true,
        },
      },
    },
  });
  if (!doc) notFound();

  const editorCtx = await getEditorContext(ctx.team.id);

  const totalTime = doc.views.reduce((s, v) => s + v.totalDuration, 0);
  const uniqueEmails = new Set(
    doc.views.map((v) => v.viewerEmail).filter(Boolean)
  );

  // avg dwell per page across views
  const pageAgg = new Map<number, { total: number; count: number }>();
  for (const v of doc.views) {
    for (const pv of v.pageViews) {
      const agg = pageAgg.get(pv.pageNumber) ?? { total: 0, count: 0 };
      agg.total += pv.duration;
      agg.count += 1;
      pageAgg.set(pv.pageNumber, agg);
    }
  }
  const pages = [...pageAgg.entries()]
    .map(([pageNumber, agg]) => ({
      pageNumber,
      avgSeconds: agg.total / agg.count,
      views: agg.count,
    }))
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const createLinkButton = (
    <LinkEditor
      mode="create"
      target={{ type: "DOCUMENT", id: doc.id, name: doc.name }}
      domains={editorCtx.domains}
      agreements={editorCtx.agreements}
      presets={editorCtx.presets}
      previewPresets={editorCtx.previewPresets}
      appHost={editorCtx.appHost}
      trigger={
        <Button>
          <Plus className="size-4" /> Create link
        </Button>
      }
    />
  );

  return (
    <div>
      <div className="border-b px-4 sm:px-8 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link href="/documents" className="hover:text-foreground">
                Documents
              </Link>
              <ChevronRight className="size-3" />
              <span>{doc.name}</span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <FileIcon type={doc.type} className="size-6" />
              <DocumentTitle documentId={doc.id} name={doc.name} />
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {docTypeLabel(doc.type)}
              {doc.currentVersion?.fileSize
                ? ` · ${formatBytes(doc.currentVersion.fileSize)}`
                : ""}
              {doc.currentVersion?.numPages
                ? ` · ${doc.currentVersion.numPages} pages`
                : ""}
              {` · version ${doc.currentVersion?.versionNumber ?? 1}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {doc.type !== "NOTION" && (
              <VersionUploadButton documentId={doc.id} />
            )}
            {createLinkButton}
          </div>
        </div>
      </div>

      <div className="space-y-8 px-4 sm:px-8 py-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Views" value={doc.views.length} />
          <Stat label="Unique visitors" value={uniqueEmails.size} />
          <Stat label="Total time" value={formatDuration(totalTime)} />
          <Stat
            label="Avg time"
            value={formatDuration(
              doc.views.length ? totalTime / doc.views.length : 0
            )}
          />
        </div>

        <section>
          <h2 className="mb-3 font-display text-xl">Links</h2>
          {doc.links.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="Not shared yet"
              description="Create a link to share this document. You choose who can open it and what they can do."
            >
              {createLinkButton}
            </EmptyState>
          ) : (
            <LinksTable
              showTarget={false}
              ctx={editorCtx}
              rows={await Promise.all(doc.links.map(async (link) => {
                const url = await linkUrl(link);
                return {
                  id: link.id,
                  name: link.name,
                  url,
                  displayUrl: url.replace(/^https?:\/\//, ""),
                  targetType: "DOCUMENT" as const,
                  targetId: doc.id,
                  targetName: doc.name,
                  views: link._count.views,
                  lastViewed: link.views[0]?.startedAt.toISOString() ?? null,
                  isArchived: link.isArchived,
                  editor: toEditorLink(link),
                  tree: [],
                  groups: [],
                  recipients: link.recipients.map((r) => ({
                    id: r.id,
                    email: r.email,
                    expiresAt: r.expiresAt?.toISOString() ?? null,
                    invitedAt: r.invitedAt.toISOString(),
                  })),
                };
              }))}
            />
          )}
        </section>

        {pages.length > 0 && (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-card p-5">
              <h2 className="mb-4 font-display text-xl">Reading time by page</h2>
              <PageDwell
                pages={pages}
                versionId={doc.currentVersion?.id}
                isPdf={doc.type === "PDF"}
              />
            </div>
            <div className="rounded-lg border bg-card p-5">
              <h2 className="mb-4 font-display text-xl">Version history</h2>
              <VersionList doc={doc} />
            </div>
          </section>
        )}

        {pages.length === 0 && (
          <section className="rounded-lg border bg-card p-5">
            <h2 className="mb-4 font-display text-xl">Version history</h2>
            <VersionList doc={doc} />
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl">Recent views</h2>
            {doc.views.length > 0 && (
              <ExportButton href={`/api/export/document/${doc.id}`} />
            )}
          </div>
          <ViewsTable
            rows={await Promise.all(doc.views.map(async (v) => ({
              id: v.id,
              viewerId: v.viewerId,
              email: v.viewerEmail,
              verified: v.verified,
              linkName: v.link.name,
              linkUrl: await linkUrl(v.link),
              duration: v.totalDuration,
              completedPct: v.completedPct,
              device: v.device,
              browser: v.browser,
              country: v.country,
              city: v.city,
              startedAt: v.startedAt.toISOString(),
              downloaded: !!v.downloadedAt,
            })))}
          />
        </section>
      </div>
    </div>
  );
}

function VersionList({
  doc,
}: {
  doc: {
    id: string;
    currentVersionId: string | null;
    versions: {
      id: string;
      versionNumber: number;
      fileName: string;
      fileSize: number;
      createdAt: Date;
      note: string | null;
      uploadedBy: { email: string } | null;
    }[];
  };
}) {
  return (
    <div className="space-y-1">
      {doc.versions.map((v) => (
        <div
          key={v.id}
          className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
        >
          <Badge
            variant={v.id === doc.currentVersionId ? "default" : "secondary"}
            className="font-mono"
          >
            v{v.versionNumber}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{v.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {v.uploadedBy?.email ?? "unknown"} · {formatDateTime(v.createdAt)}
              {v.fileSize ? ` · ${formatBytes(v.fileSize)}` : ""}
              {v.note ? ` · ${v.note}` : ""}
            </p>
          </div>
          {v.id !== doc.currentVersionId && (
            <RestoreVersionButton documentId={doc.id} versionId={v.id} />
          )}
        </div>
      ))}
    </div>
  );
}
