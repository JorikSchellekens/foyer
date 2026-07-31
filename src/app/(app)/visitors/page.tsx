import Link from "next/link";
import { Users, BadgeCheck } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatDuration, timeAgo, initials } from "@/lib/format";
import { teamMemberEmails } from "@/lib/internal-views";
import { ExportButton } from "@/components/shell/export-button";

export const metadata = { title: "Visitors" };

/** Column heads recede so the visitor column reads as the primary axis. */
const HEAD = "h-9 text-xs font-medium text-muted-foreground";
/** Secondary metrics: mono and tabular so the columns align optically. */
const NUM = "py-2.5 font-mono text-[0.8125rem] text-muted-foreground tabular";

export default async function VisitorsPage() {
  const ctx = await requireTeam();
  // Team members are internal, not visitors - keep them out of the directory.
  const members = new Set(await teamMemberEmails(ctx.team.id));
  const viewers = await db.viewer.findMany({
    where: { teamId: ctx.team.id },
    include: {
      views: {
        select: {
          totalDuration: true,
          startedAt: true,
          documentId: true,
          dataroomId: true,
        },
      },
    },
  });

  const rows = viewers
    .filter((v) => !members.has(v.email.toLowerCase()))
    .map((v) => {
      const lastSeen = v.views.reduce<Date | null>(
        (acc, view) => (!acc || view.startedAt > acc ? view.startedAt : acc),
        null
      );
      return {
        id: v.id,
        email: v.email,
        verified: v.verified,
        visits: v.views.length,
        totalTime: v.views.reduce((s, view) => s + view.totalDuration, 0),
        documents: new Set(v.views.map((x) => x.documentId).filter(Boolean))
          .size,
        lastSeen,
      };
    })
    .sort((a, b) => (b.lastSeen?.getTime() ?? 0) - (a.lastSeen?.getTime() ?? 0));

  return (
    <div>
      <PageHeader
        title="Visitors"
        description="Everyone who has opened your links, and how deeply they read."
      >
        {rows.length > 0 && <ExportButton href="/api/export/visitors" />}
      </PageHeader>
      <div className="px-4 sm:px-8 py-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No visitors yet"
            description="When someone opens a link that asks for an email, they appear here with their full reading history."
          />
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={HEAD}>Visitor</TableHead>
                  <TableHead className={`${HEAD} w-28`}>Visits</TableHead>
                  <TableHead className={`${HEAD} w-32`}>Documents</TableHead>
                  <TableHead className={`${HEAD} w-32`}>Time spent</TableHead>
                  <TableHead className={`${HEAD} w-32 text-right`}>
                    Last seen
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((v, i) => (
                  <TableRow
                    key={v.id}
                    className="stagger-item"
                    // Cap the cascade: a long list should not ripple for seconds.
                    style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
                  >
                    <TableCell className="py-2.5">
                      <Link
                        href={`/visitors/${v.id}`}
                        className="group -mx-1 flex items-center gap-2.5 rounded-md px-1 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                          {initials(v.email)}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium group-hover:underline group-hover:decoration-primary/40 group-hover:underline-offset-4">
                            {v.email}
                          </span>
                          {v.verified && (
                            <BadgeCheck
                              role="img"
                              aria-label="Email verified"
                              className="size-3.5 shrink-0 text-primary"
                            />
                          )}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className={NUM}>{v.visits}</TableCell>
                    <TableCell className={NUM}>{v.documents}</TableCell>
                    <TableCell className={NUM}>
                      {formatDuration(v.totalTime)}
                    </TableCell>
                    <TableCell className={`${NUM} text-right`}>
                      {v.lastSeen ? (
                        <time
                          dateTime={v.lastSeen.toISOString()}
                          title={formatDateTime(v.lastSeen)}
                        >
                          {timeAgo(v.lastSeen)}
                        </time>
                      ) : (
                        <span aria-hidden>-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
