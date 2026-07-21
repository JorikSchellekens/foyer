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
import { formatDuration, timeAgo, initials } from "@/lib/format";
import { teamMemberEmails } from "@/lib/internal-views";
import { ExportButton } from "@/components/shell/export-button";

export const metadata = { title: "Visitors" };

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
                <TableRow>
                  <TableHead>Visitor</TableHead>
                  <TableHead className="w-28">Visits</TableHead>
                  <TableHead className="w-32">Documents</TableHead>
                  <TableHead className="w-32">Time spent</TableHead>
                  <TableHead className="w-32 text-right">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Link
                        href={`/visitors/${v.id}`}
                        className="flex items-center gap-2.5"
                      >
                        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                          {initials(v.email)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium hover:underline">
                            {v.email}
                          </span>
                          {v.verified && (
                            <BadgeCheck className="size-3.5 text-primary" />
                          )}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="tabular">{v.visits}</TableCell>
                    <TableCell className="tabular">{v.documents}</TableCell>
                    <TableCell className="font-mono text-sm tabular">
                      {formatDuration(v.totalTime)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {v.lastSeen ? timeAgo(v.lastSeen) : "—"}
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
