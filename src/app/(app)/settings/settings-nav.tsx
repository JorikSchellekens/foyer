"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings", label: "General" },
  { href: "/settings/members", label: "Team members" },
  { href: "/settings/branding", label: "Branding" },
  { href: "/settings/domains", label: "Custom domains" },
  { href: "/settings/agreements", label: "Agreements" },
  { href: "/settings/presets", label: "Link presets" },
  { href: "/settings/previews", label: "Link previews" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/tokens", label: "API & MCP" },
  { href: "/settings/webhooks", label: "Webhooks" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="w-full shrink-0 lg:w-48">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "block whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                pathname === item.href
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
