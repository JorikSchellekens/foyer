"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Monitor, Smartphone, Tablet } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDuration, timeAgo, initials } from "@/lib/format";

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

function DeviceIcon({ device }: { device: string | null }) {
  const cls = "size-3.5";
  if (device === "mobile") return <Smartphone className={cls} />;
  if (device === "tablet") return <Tablet className={cls} />;
  return <Monitor className={cls} />;
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
      <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        No visits yet. They will appear here the moment someone opens a link.
      </p>
    );

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Visitor</TableHead>
            {showItem && <TableHead>Viewed</TableHead>}
            <TableHead>Link</TableHead>
            <TableHead className="w-28">Time spent</TableHead>
            <TableHead className="w-28">Read</TableHead>
            <TableHead className="w-36">Where</TableHead>
            <TableHead className="w-28 text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((v) => (
            <TableRow
              key={v.id}
              className="cursor-pointer"
              title="Open visit detail"
              onClick={() => router.push(`/views/${v.id}`)}
            >
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-semibold text-primary">
                    {v.email ? initials(v.email) : "—"}
                  </span>
                  <div className="min-w-0">
                    {v.viewerId ? (
                      <Link
                        href={`/visitors/${v.viewerId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {v.email}
                      </Link>
                    ) : (
                      <span className="block truncate text-sm font-medium">
                        {v.email ?? "Anonymous"}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      {v.verified && (
                        <span className="text-[11px] text-primary">
                          verified
                        </span>
                      )}
                      {v.downloaded && (
                        <span className="text-[11px] text-muted-foreground">
                          downloaded
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </TableCell>
              {showItem && (
                <TableCell className="max-w-44">
                  {v.itemHref ? (
                    <Link
                      href={v.itemHref}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate text-sm hover:underline"
                    >
                      {v.itemName ?? "—"}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm">
                      {v.itemName ?? "—"}
                    </span>
                  )}
                </TableCell>
              )}
              <TableCell className="max-w-36">
                {v.linkUrl ? (
                  <a
                    href={v.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open the shared link"
                    className="group inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <span className="truncate">{v.linkName}</span>
                    <ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                ) : (
                  <span className="block truncate text-sm text-muted-foreground">
                    {v.linkName}
                  </span>
                )}
              </TableCell>
              <TableCell className="font-mono text-sm tabular">
                {formatDuration(v.duration)}
              </TableCell>
              <TableCell>
                {v.completedPct !== null ? (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${v.completedPct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs tabular text-muted-foreground">
                      {v.completedPct}%
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <DeviceIcon device={v.device} />
                  <span className="truncate">
                    {[v.city, v.country].filter(Boolean).join(", ") ||
                      v.browser ||
                      "Unknown"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {timeAgo(v.startedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
