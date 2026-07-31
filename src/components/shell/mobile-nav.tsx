"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, LogOut, Menu, Plus, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { initials } from "@/lib/format";
import { switchTeam } from "@/app/(app)/actions";
import { FoyerLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { navIconClasses, navItemClasses } from "@/components/shell/nav-item";
import { NAV } from "./sidebar";

/** Header controls: 36px on touch, quiet until pressed. */
const BAR_ICON = cn(
  "focus-ring inline-flex size-9 items-center justify-center rounded-md text-muted-foreground",
  "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)]",
  "hover:bg-sidebar-accent hover:text-sidebar-foreground"
);

export function MobileNav({
  teams,
  activeTeamId,
  userEmail,
}: {
  teams: { id: string; name: string }[];
  activeTeamId: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = teams.find((t) => t.id === activeTeamId) ?? teams[0];
  const settingsActive = pathname.startsWith("/settings");

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 items-center gap-1 border-b bg-sidebar md:hidden",
        // Respect a notch in landscape without losing the 16px baseline.
        "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
      )}
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className={BAR_ICON} aria-label="Open menu">
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[19rem] gap-0 p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-left font-normal">
              <FoyerLogo size="md" />
            </SheetTitle>
          </SheetHeader>

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
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    navItemClasses({ active: isActive, tone: "content" }),
                    "py-2.5"
                  )}
                >
                  <item.icon
                    className={navIconClasses(isActive)}
                    strokeWidth={isActive ? 2 : 1.75}
                  />
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              aria-current={settingsActive ? "page" : undefined}
              className={cn(
                navItemClasses({ active: settingsActive, tone: "content" }),
                "py-2.5"
              )}
            >
              <Settings
                className={navIconClasses(settingsActive)}
                strokeWidth={settingsActive ? 2 : 1.75}
              />
              Settings
            </Link>
          </nav>

          <div className="mt-auto border-t px-3 py-3">
            <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Workspaces
            </p>
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setOpen(false);
                  switchTeam(t.id);
                }}
                className={cn(
                  navItemClasses({
                    active: t.id === active.id,
                    tone: "content",
                  }),
                  "w-full py-2.5 text-left"
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-[10px] font-semibold text-primary">
                  {initials(t.name)}
                </span>
                <span className="flex-1 truncate">{t.name}</span>
                {t.id === active.id && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            ))}
            <Link
              href="/onboarding"
              onClick={() => setOpen(false)}
              className={cn(
                navItemClasses({ active: false, tone: "content" }),
                "py-2.5"
              )}
            >
              <Plus className="size-4 shrink-0" /> New workspace
            </Link>
            <div className="flex items-center justify-between gap-2 pl-3 pr-0.5 pt-2">
              <span
                className="truncate text-xs text-muted-foreground"
                title={userEmail}
              >
                {userEmail}
              </span>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  title="Sign out"
                  aria-label="Sign out"
                  className={cn(BAR_ICON, "hover:bg-secondary")}
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Link
        href="/dashboard"
        aria-label="Foyer"
        className="focus-ring press ml-1 rounded-sm"
      >
        <FoyerLogo size="sm" />
      </Link>
      <span className="ml-auto min-w-0 truncate pl-2 text-xs text-muted-foreground">
        {active.name}
      </span>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("foyer:open-command"))}
        aria-label="Search"
        className={BAR_ICON}
      >
        <Search className="size-4" />
      </button>
      <ThemeToggle className={BAR_ICON} />
    </header>
  );
}
