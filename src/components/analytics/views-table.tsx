"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  ChevronRight,
  Download,
  Eye,
  ExternalLink,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shell/empty-state";
import { formatDateTime, formatDuration, timeAgo, initials } from "@/lib/format";

export type ViewRowData = {
  id: string;
  viewerId: string | null;
  email: string | null;
  verified: boolean;
  linkName: string;
  /** public URL of the link, opens in a new tab */
  linkUrl?: string | null;
  itemName?: string | null;
  /** dashboard page of the viewed document / data room */
  itemHref?: string | null;
  duration: number;
  completedPct: number | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  city: string | null;
  startedAt: string;
  downloaded: boolean;
};

/** Column heads recede so the visitor column reads as the primary axis. */
const HEAD = "h-9 text-xs font-medium text-muted-foreground";
/** Any nested link: keyboard focus has to be visible inside a dense row. */
const CELL_LINK =
  "-mx-1 rounded-md px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring";

function DeviceIcon({ device }: { device: string | null }) {
  const cls = "size-3.5 shrink-0";
  if (device === "mobile") return <Smartphone className={cls} aria-hidden />;
  if (device === "tablet") return <Tablet className={cls} aria-hidden />;
  return <Monitor className={cls} aria-hidden />;
}

export function ViewsTable({
  rows,
  showItem = false,
}: {
  rows: ViewRowData[];
  showItem?: boolean;
}) {
  const router = useRouter();

  if (rows.length === 0)
    return (
      <EmptyState
        icon={Eye}
        title="No visits yet"
        description="They will appear here the moment someone opens a link, with time spent and how far they read."
      />
    );

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={HEAD}>Visitor</TableHead>
            {showItem && <TableHead className={HEAD}>Viewed</TableHead>}
            <TableHead className={HEAD}>Link</TableHead>
            <TableHead className={`${HEAD} w-28`}>Time spent</TableHead>
            <TableHead className={`${HEAD} w-28`}>Read</TableHead>
            <TableHead className={`${HEAD} w-36`}>Where</TableHead>
            <TableHead className={`${HEAD} w-28 text-right`}>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((v, i) => (
            <TableRow
              key={v.id}
              className="stagger-item group cursor-pointer"
              // Cap the cascade: a long table should not ripple for seconds.
              style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
              title="Open visit detail"
              onClick={() => router.push(`/views/${v.id}`)}
            >
              <TableCell className="py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-semibold text-primary">
                    {v.email ? initials(v.email) : "-"}
                  </span>
                  <div className="min-w-0">
                    {v.viewerId ? (
                      <Link
                        href={`/visitors/${v.viewerId}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`block truncate text-sm font-medium hover:underline hover:decoration-primary/40 hover:underline-offset-4 ${CELL_LINK}`}
                      >
                        {v.email}
                      </Link>
                    ) : (
                      <span className="block truncate text-sm font-medium">
                        {v.email ?? "Anonymous"}
                      </span>
                    )}
                    {(v.verified || v.downloaded) && (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {v.verified && (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <BadgeCheck className="size-3" aria-hidden />
                            verified
                          </span>
                        )}
                        {v.downloaded && (
                          <span className="inline-flex items-center gap-1">
                            <Download className="size-3" aria-hidden />
                            downloaded
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              {showItem && (
                <TableCell className="max-w-44 py-2.5">
                  {v.itemHref ? (
                    <Link
                      href={v.itemHref}
                      onClick={(e) => e.stopPropagation()}
                      className={`block truncate text-sm hover:underline hover:decoration-primary/40 hover:underline-offset-4 ${CELL_LINK}`}
                    >
                      {v.itemName ?? "-"}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm">
                      {v.itemName ?? "-"}
                    </span>
                  )}
                </TableCell>
              )}
              <TableCell className="max-w-36 py-2.5">
                {v.linkUrl ? (
                  <a
                    href={v.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open the shared link"
                    className={`inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:text-foreground hover:underline ${CELL_LINK}`}
                  >
                    <span className="truncate">{v.linkName}</span>
                    {/* Reserved space, so revealing it cannot nudge the label. */}
                    <ExternalLink
                      className="size-3 shrink-0 -translate-x-0.5 opacity-0 transition duration-[var(--dur)] ease-[var(--ease-out-quint)] group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
                      aria-hidden
                    />
                  </a>
                ) : (
                  <span className="block truncate text-sm text-muted-foreground">
                    {v.linkName}
                  </span>
                )}
              </TableCell>
              <TableCell className="py-2.5 font-mono text-[0.8125rem] text-muted-foreground tabular">
                {formatDuration(v.duration)}
              </TableCell>
              <TableCell className="py-2.5">
                {v.completedPct !== null ? (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-[var(--dur-reveal)] ease-[var(--ease-out-quint)]"
                        style={{ width: `${v.completedPct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground tabular">
                      {v.completedPct}%
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground" aria-hidden>
                    -
                  </span>
                )}
              </TableCell>
              <TableCell className="py-2.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <DeviceIcon device={v.device} />
                  <span className="truncate">
                    {[v.city, v.country].filter(Boolean).join(", ") ||
                      v.browser ||
                      "Unknown"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-2.5 text-right">
                {/* The row is click-anywhere for the mouse; this link is what
                    makes the visit detail reachable from the keyboard. */}
                <Link
                  href={`/views/${v.id}`}
                  onClick={(e) => e.stopPropagation()}
                  title={formatDateTime(v.startedAt)}
                  className={`inline-flex items-center gap-0.5 font-mono text-xs text-muted-foreground tabular transition-colors duration-[var(--dur-fast)] hover:text-foreground ${CELL_LINK}`}
                >
                  <time dateTime={v.startedAt}>{timeAgo(v.startedAt)}</time>
                  <ChevronRight
                    className="size-3.5 shrink-0 -translate-x-0.5 opacity-0 transition duration-[var(--dur)] ease-[var(--ease-out-quint)] group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
                    aria-hidden
                  />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
