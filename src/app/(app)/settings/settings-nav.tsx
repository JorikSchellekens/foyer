"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItemClasses } from "@/components/shell/nav-item";

/**
 * Eleven destinations is too many for one list. Grouped, each heading answers
 * "what am I configuring": the workspace itself, how shares look to visitors,
 * what we send outward, and one-off data moves.
 */
const GROUPS: { heading: string; items: { href: string; label: string }[] }[] = [
  {
    heading: "Workspace",
    items: [
      { href: "/settings", label: "General" },
      { href: "/settings/members", label: "Team members" },
      { href: "/settings/notifications", label: "Notifications" },
    ],
  },
  {
    heading: "Sharing",
    items: [
      { href: "/settings/branding", label: "Branding" },
      { href: "/settings/domains", label: "Custom domains" },
      { href: "/settings/presets", label: "Link presets" },
      { href: "/settings/previews", label: "Link previews" },
      { href: "/settings/agreements", label: "Agreements" },
    ],
  },
  {
    heading: "Developer",
    items: [
      { href: "/settings/tokens", label: "API & MCP" },
      { href: "/settings/webhooks", label: "Webhooks" },
    ],
  },
  {
    heading: "Data",
    items: [{ href: "/settings/import", label: "Import" }],
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    // Sticky beside long settings pages; horizontally scrolled on small
    // screens, where the group headings would only cost width.
    <nav
      aria-label="Settings"
      className="w-full shrink-0 lg:sticky lg:top-24 lg:w-52 lg:self-start"
    >
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0">
        {GROUPS.map((group) => (
          <li key={group.heading} className="flex gap-1 lg:flex-col">
            <p className="hidden px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground lg:block">
              {group.heading}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    navItemClasses({ active, compact: true, tone: "content" }),
                    "whitespace-nowrap"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </li>
        ))}
      </ul>
    </nav>
  );
}
