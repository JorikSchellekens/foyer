import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ChevronRight, MousePointer2 } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { Stat } from "@/components/shell/stat";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileIcon } from "@/components/shell/file-icon";
import {
  formatDuration,
  timeAgo,
  formatDateTime,
  initials,
} from "@/lib/format";

export default async function VisitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTeam();
  const { id } = await params;
  const viewer = await db.viewer.findFirst({
    where: { id, teamId: ctx.team.id },
    include: {
      views: {
        orderBy: { startedAt: "desc" },
        include: {
          document: true,
          dataroom: true,
          link: true,
          _count: { select: { mouseBatches: true } },
        },
      },
    },
  });
  if (!viewer) notFound();

  const totalTime = viewer.views.reduce((s, v) => s + v.totalDuration, 0);

  // per-document rollup: the "NA" table
  const perDoc = new Map<
    string,
    {
      documentId: string | null;
      name: string;
      type: import("@prisma/client").DocumentType | null;
      lastViewed: Date;
      timeSpent: number;
      visits: number;
    }
  >();
  for (const v of viewer.views) {
    const key = v.documentId ?? (v.dataroomId ? `dr-${v.dataroomId}` : v.linkId);
    const name =
      v.document?.name ??
      (v.dataroom ? `${v.dataroom.name} (index)` : v.link.name);
    const agg = perDoc.get(key) ?? {
      documentId: v.documentId,
      name,
      type: v.document?.type ?? null,
      lastViewed: v.startedAt,
      timeSpent: 0,
      visits: 0,
    };
    agg.timeSpent += v.totalDuration;
    agg.visits += 1;
    if (v.startedAt > agg.lastViewed) agg.lastViewed = v.startedAt;
    perDoc.set(key, agg);
  }
  const docRows = [...perDoc.values()].sort(
    (a, b) => b.lastViewed.getTime() - a.lastViewed.getTime()
  );

  return (
    <div>
      <div className="border-b px-4 sm:px-8 py-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/visitors" className="hover:text-foreground">
            Visitors
          </Link>
          <ChevronRight className="size-3" />
          <span>{viewer.email}</span>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 font-mono text-base font-semibold text-primary">
            {initials(viewer.email)}
          </span>
          <div>
            <h1 className="flex items-center gap-2 font-display text-3xl tracking-tight">
              {viewer.email}
              {viewer.verified && (
                <BadgeCheck className="size-5 text-primary" />
              )}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              First seen {formatDateTime(viewer.createdAt)}
              {viewer.verified ? " · email verified" : " · email unverified"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8 px-4 sm:px-8 py-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Visits" value={viewer.views.length} />
          <Stat label="Documents opened" value={docRows.length} />
          <Stat label="Total time" value={formatDuration(totalTime)} />
          <Stat
            label="Avg visit"
            value={formatDuration(
              viewer.views.length ? totalTime / viewer.views.length : 0
            )}
          />
        </div>

        <section>
          <h2 className="mb-3 font-display text-xl">Reading history</h2>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document name</TableHead>
                  <TableHead className="w-36">Last viewed</TableHead>
                  <TableHead className="w-32">Time spent</TableHead>
                  <TableHead className="w-24 text-right">Visits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docRows.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {d.type && <FileIcon type={d.type} />}
                        {d.documentId ? (
                          <Link
                            href={`/documents/${d.documentId}`}
                            className="font-medium hover:underline"
                          >
                            {d.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{d.name}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {timeAgo(d.lastViewed)}
                    </TableCell>
                    <TableCell className="font-mono text-sm tabular">
                      {formatDuration(d.timeSpent)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {d.visits}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl">Individual visits</h2>
          <div className="space-y-1.5">
            {viewer.views.map((v) => (
              <Link
                key={v.id}
                href={`/views/${v.id}`}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {v.document?.name ??
                      (v.dataroom ? `${v.dataroom.name} (index)` : v.link.name)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    via “{v.link.name}” · {formatDateTime(v.startedAt)}
                    {v.city || v.country
                      ? ` · ${[v.city, v.country].filter(Boolean).join(", ")}`
                      : ""}
                  </p>
                </div>
                {v._count.mouseBatches > 0 && (
                  <span
                    className="flex items-center gap-1 text-xs text-primary"
                    title="Attention map available"
                  >
                    <MousePointer2 className="size-3.5" /> attention map
                  </span>
                )}
                <span className="font-mono text-sm tabular text-muted-foreground">
                  {formatDuration(v.totalDuration)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
