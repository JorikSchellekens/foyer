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

export const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/datarooms", label: "Data rooms", icon: FolderLock },
  { href: "/links", label: "Links", icon: Link2 },
  { href: "/signatures", label: "Signatures", icon: PenLine },
  { href: "/visitors", label: "Visitors", icon: Users },
];

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

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground max-md:hidden">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <Link href="/dashboard" aria-label="Foyer">
          <FoyerLogo size="md" />
        </Link>
        <NotificationBell />
      </div>

      <div className="px-3 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-left text-sm hover:bg-accent">
            <span className="flex size-6 items-center justify-center rounded bg-primary/10 font-mono text-[11px] font-semibold text-primary">
              {initials(active.name)}
            </span>
            <span className="flex-1 truncate font-medium">{active.name}</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {teams.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => switchTeam(t.id)}>
                <span className="flex-1 truncate">{t.name}</span>
                {t.id === active.id && <Check className="size-4" />}
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
          className="flex w-full items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span className="flex-1">Search</span>
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {NAV.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t px-3 py-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-sidebar-accent font-medium"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          )}
        >
          <Settings className="size-4" strokeWidth={1.75} />
          Settings
        </Link>
        <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
          <span className="truncate text-xs text-muted-foreground">
            {userEmail}
          </span>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                title="Sign out"
                className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <LogOut className="size-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
