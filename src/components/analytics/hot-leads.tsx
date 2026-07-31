import Link from "next/link";
import { Flame, ArrowRight } from "lucide-react";
import { initials, timeAgo } from "@/lib/format";
import type { HotLead } from "@/lib/analytics";

/**
 * Engagement as four ticks relative to the strongest lead in the window. The
 * score is a ranking heuristic, not a measured quantity, so it is shown as a
 * coarse meter rather than a number that would invite arithmetic.
 */
function Intensity({ filled, label }: { filled: number; label: string }) {
  return (
    <span
      className="flex shrink-0 items-center gap-[3px]"
      title={label}
      aria-label={label}
      role="img"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-3 w-[3px] rounded-full ${
            i < filled ? "bg-primary" : "bg-border"
          }`}
        />
      ))}
    </span>
  );
}

/** "Worth following up" card: the most-engaged recent visitors, ranked. */
export function HotLeads({ leads }: { leads: HotLead[] }) {
  if (leads.length === 0) return null;
  const top = Math.max(...leads.map((l) => l.score), 1);
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-baseline gap-2">
        <Flame className="size-4 translate-y-0.5 text-primary" aria-hidden />
        <h2 className="font-display text-xl">Worth following up</h2>
        <span className="text-xs text-muted-foreground">last 14 days</span>
      </div>
      <ul className="divide-y">
        {leads.map((lead, i) => {
          // Quarter of the leader's score, floored at one tick: everyone in
          // this list already earned their place.
          const filled = Math.max(1, Math.ceil((lead.score / top) * 4));
          const row = (
            <div className="flex items-center gap-3 py-2.5">
              <span className="w-3 shrink-0 font-mono text-[11px] tabular text-muted-foreground">
                {i + 1}
              </span>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                {initials(lead.email)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{lead.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {lead.reason}
                </div>
              </div>
              <Intensity
                filled={filled}
                label={`Engagement ${filled} of 4`}
              />
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                {timeAgo(lead.lastSeen)}
              </span>
              {lead.viewerId && (
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--dur)] ease-[var(--ease-out-quint)] group-hover/lead:translate-x-0.5 group-hover/lead:text-foreground" />
              )}
            </div>
          );
          return (
            <li key={lead.email} className="stagger-item" style={{ "--i": i } as React.CSSProperties}>
              {lead.viewerId ? (
                <Link
                  href={`/visitors/${lead.viewerId}`}
                  className="group/lead -mx-2 block rounded-md px-2 transition-colors duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
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
