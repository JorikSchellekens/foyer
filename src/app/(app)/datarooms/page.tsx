import Link from "next/link";
import { FolderLock, FileText, Link2, Eye } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { formatDateTime, timeAgo, pluralize } from "@/lib/format";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";
import { ShareButton } from "@/components/links/quick-share";
import { NewDataroomDialog } from "./new-dataroom";

export const metadata = { title: "Data rooms" };

export default async function DataroomsPage() {
  const ctx = await requireTeam();
  const { accessibleDataroomIds } = await import("@/lib/permissions");
  const allowed = await accessibleDataroomIds(ctx);
  const extFilter = externalViews(await teamMemberEmails(ctx.team.id));
  const datarooms = await db.dataroom.findMany({
    where: {
      teamId: ctx.team.id,
      ...(allowed === "all" ? {} : { id: { in: allowed } }),
    },
    include: {
      _count: {
        select: {
          documents: true,
          links: true,
          views: { where: extFilter },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Data rooms"
        description="Curated collections with their own access links, permissions and branding."
      >
        <NewDataroomDialog />
      </PageHeader>

      <div className="px-4 sm:px-8 py-6">
        {datarooms.length === 0 ? (
          <EmptyState
            icon={FolderLock}
            title="No data rooms yet"
            description="A data room bundles documents behind one link, with folders, granular permissions, NDA gates and per-visitor analytics."
          >
            <NewDataroomDialog />
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {datarooms.map((dr, i) => (
              <Link
                key={dr.id}
                href={`/datarooms/${dr.id}`}
                // .hover-raise owns the transform transition here, so no .press:
                // its transition shorthand would reset the shadow/border easing.
                className="stagger-item hover-raise group relative flex flex-col rounded-lg border bg-card p-5 outline-none hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring"
                // Cap the cascade: a wall of rooms should not ripple for seconds.
                style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
              >
                <div className="flex items-start justify-between">
                  <FolderLock
                    className="size-5 text-primary"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <div className="flex items-center gap-1">
                    <time
                      dateTime={dr.updatedAt.toISOString()}
                      title={formatDateTime(dr.updatedAt)}
                      className="font-mono text-xs text-muted-foreground tabular"
                    >
                      {timeAgo(dr.updatedAt)}
                    </time>
                    <ShareButton
                      target={{ type: "DATAROOM", id: dr.id }}
                      className="opacity-0 transition-opacity duration-[var(--dur)] ease-[var(--ease-out-soft)] group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                    />
                  </div>
                </div>
                <h2 className="mt-3 font-display text-xl leading-snug group-hover:underline group-hover:decoration-primary/40 group-hover:underline-offset-4">
                  {dr.name}
                </h2>
                {dr.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {dr.description}
                  </p>
                )}
                {/* Counts pinned to the card foot so a grid of cards keeps one
                    baseline whether or not a room has a description. */}
                <div className="mt-4 flex items-center gap-4 font-mono text-xs text-muted-foreground tabular md:mt-auto md:pt-4">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="size-3.5" aria-hidden />
                    {pluralize(dr._count.documents, "file")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Link2 className="size-3.5" aria-hidden />
                    {pluralize(dr._count.links, "link")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Eye className="size-3.5" aria-hidden />
                    {pluralize(dr._count.views, "visit")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
