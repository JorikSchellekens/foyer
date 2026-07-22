"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, LogOut, Menu, Plus, Settings } from "lucide-react";
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
import { NAV } from "./sidebar";

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

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-sidebar px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className="rounded-md p-1.5 hover:bg-sidebar-accent"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-left font-normal">
              <FoyerLogo size="md" />
            </SheetTitle>
          </SheetHeader>

          <nav className="space-y-0.5 px-3 py-3">
            {NAV.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm transition-colors",
                    isActive
                      ? "bg-secondary font-medium"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4" strokeWidth={1.75} />
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm transition-colors",
                pathname.startsWith("/settings")
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              <Settings className="size-4" strokeWidth={1.75} />
              Settings
            </Link>
          </nav>

          <div className="mt-auto border-t px-3 py-3">
            <p className="px-2.5 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Workspaces
            </p>
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setOpen(false);
                  switchTeam(t.id);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-secondary/60"
              >
                <span className="flex size-6 items-center justify-center rounded bg-primary/10 font-mono text-[10px] font-semibold text-primary">
                  {initials(t.name)}
                </span>
                <span className="flex-1 truncate">{t.name}</span>
                {t.id === active.id && <Check className="size-4" />}
              </button>
            ))}
            <Link
              href="/onboarding"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              <Plus className="size-4" /> New workspace
            </Link>
            <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
              <span className="truncate text-xs text-muted-foreground">
                {userEmail}
              </span>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  title="Sign out"
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <LogOut className="size-3.5" />
                </button>
              </form>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Link href="/dashboard" aria-label="Foyer">
        <FoyerLogo size="sm" />
      </Link>
      <span className="ml-auto truncate text-xs text-muted-foreground">
        {active.name}
      </span>
      <ThemeToggle className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" />
    </header>
  );
}
