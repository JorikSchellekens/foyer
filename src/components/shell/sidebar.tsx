"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  FileText,
  FolderLock,
  Link2,
  PenLine,
  Users,
  Settings,
  ChevronsUpDown,
  Plus,
  LogOut,
  Check,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { switchTeam } from "@/app/(app)/actions";
import { FoyerLogo } from "@/components/brand/logo";
import { NotificationBell } from "@/components/shell/notification-bell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Kbd } from "@/components/shell/kbd";
import { navIconClasses, navItemClasses } from "@/components/shell/nav-item";

export const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/datarooms", label: "Data rooms", icon: FolderLock },
  { href: "/links", label: "Links", icon: Link2 },
  { href: "/signatures", label: "Signatures", icon: PenLine },
  { href: "/visitors", label: "Visitors", icon: Users },
];

/**
 * Team switcher and search share one control treatment: card face, hairline
 * that firms up on hover, same height as a nav row.
 */
const CONTROL = cn(
  "focus-ring press flex w-full items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-left text-sm",
  "transition-[background-color,border-color] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)]",
  "hover:border-input hover:bg-accent data-[state=open]:border-input data-[state=open]:bg-accent"
);

/** Footer icon buttons: 32px hit target, quiet until hovered. */
const FOOTER_ICON = cn(
  "focus-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground",
  "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)]",
  "hover:bg-sidebar-accent hover:text-sidebar-foreground"
);

export function Sidebar({
  teams,
  activeTeamId,
  userEmail,
}: {
  teams: { id: string; name: string }[];
  activeTeamId: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const active = teams.find((t) => t.id === activeTeamId) ?? teams[0];
  const settingsActive = pathname.startsWith("/settings");

  return (
    // Sticky and viewport-tall: left to stretch, the column matches the whole
    // document and the footer row sinks off the bottom of long pages.
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground max-md:hidden">
      <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-5">
        <Link
          href="/dashboard"
          aria-label="Foyer"
          className="focus-ring press rounded-sm"
        >
          <FoyerLogo size="md" />
        </Link>
        <NotificationBell />
      </div>

      <div className="px-3 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger className={CONTROL}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-[11px] font-semibold text-primary">
              {initials(active.name)}
            </span>
            <span className="flex-1 truncate font-medium">{active.name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {teams.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => switchTeam(t.id)}>
                <span className="flex-1 truncate">{t.name}</span>
                {t.id === active.id && (
                  <Check className="size-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding">
                <Plus className="size-4" /> New workspace
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-3 pb-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("foyer:open-command"))}
          className={cn(CONTROL, "text-muted-foreground hover:text-foreground")}
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1">Search</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav
        aria-label="Main"
        className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3"
      >
        {NAV.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={navItemClasses({ active: isActive })}
            >
              <item.icon
                className={navIconClasses(isActive)}
                strokeWidth={isActive ? 2 : 1.75}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t px-3 py-3">
        <Link
          href="/settings"
          aria-current={settingsActive ? "page" : undefined}
          className={navItemClasses({ active: settingsActive })}
        >
          <Settings
            className={navIconClasses(settingsActive)}
            strokeWidth={settingsActive ? 2 : 1.75}
          />
          Settings
        </Link>
        <div className="flex items-center justify-between gap-2 pl-3 pr-0.5 pt-1">
          <span
            className="truncate text-xs text-muted-foreground"
            title={userEmail}
          >
            {userEmail}
          </span>
          <div className="flex shrink-0 items-center">
            <ThemeToggle className={FOOTER_ICON} />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className={FOOTER_ICON}
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
