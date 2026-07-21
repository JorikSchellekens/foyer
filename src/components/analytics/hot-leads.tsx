import Link from "next/link";
import { Flame, ArrowRight } from "lucide-react";
import { initials, timeAgo } from "@/lib/format";
import type { HotLead } from "@/lib/analytics";

/** "Worth following up" card: the most-engaged recent visitors, ranked. */
export function HotLeads({ leads }: { leads: HotLead[] }) {
  if (leads.length === 0) return null;
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Flame className="size-4 text-primary" />
        <h2 className="text-sm font-medium">Worth following up</h2>
        <span className="text-xs text-muted-foreground">· last 14 days</span>
      </div>
      <ul className="divide-y">
        {leads.map((lead) => {
          const row = (
            <div className="flex items-center gap-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                {initials(lead.email)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{lead.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {lead.reason}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {timeAgo(lead.lastSeen)}
              </span>
              {lead.viewerId && (
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              )}
            </div>
          );
          return (
            <li key={lead.email}>
              {lead.viewerId ? (
                <Link
                  href={`/visitors/${lead.viewerId}`}
                  className="-mx-2 block rounded-md px-2 transition-colors hover:bg-accent"
                >
                  {row}
                </Link>
              ) : (
                <div className="px-2">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
