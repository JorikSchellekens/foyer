"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Eye,
  FolderInput,
  FileUp,
  MessageCircle,
  ShieldX,
  KeyRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  loadNotifications,
  markNotificationsRead,
  type NotificationRow,
} from "@/app/(app)/notification-actions";

const ICON: Record<string, typeof Bell> = {
  document_viewed: Eye,
  dataroom_visited: FolderInput,
  file_uploaded: FileUp,
  new_question: MessageCircle,
  blocked_access: ShieldX,
  access_requested: KeyRound,
};

export function NotificationBell() {
  const router = useRouter();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);

  async function refresh() {
    const data = await loadNotifications();
    setRows(data.rows);
    setUnread(data.unread);
  }

  useEffect(() => {
    loadNotifications().then((data) => {
      setRows(data.rows);
      setUnread(data.unread);
    });
  }, []);

  async function onOpenChange(open: boolean) {
    if (open) {
      await refresh();
      if (unread > 0) {
        await markNotificationsRead();
        setUnread(0);
        setRows((prev) => prev.map((r) => ({ ...r, read: true })));
      }
    }
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        className={cn(
          "focus-ring relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground",
          "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)]",
          "hover:bg-sidebar-accent hover:text-sidebar-foreground",
          "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-foreground"
        )}
        title="Notifications"
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
      >
        <Bell className="size-4" />
        {unread > 0 && (
          // Ringed against the sidebar so the count reads as a separate chip,
          // not a smudge on the bell.
          <span
            aria-hidden
            className="tick-in absolute -right-0.5 -top-0.5 flex min-w-[15px] items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-semibold leading-[15px] text-primary-foreground tabular ring-2 ring-sidebar"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <span className="font-mono text-[11px] text-primary tabular">
              {unread} new
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <Bell
              className="mx-auto mb-3 size-6 text-muted-foreground/50"
              strokeWidth={1.25}
            />
            <p className="text-sm">Nothing yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Views, questions and access requests land here.
            </p>
          </div>
        ) : (
          <div className="max-h-[22rem] divide-y divide-border/60 overflow-y-auto">
            {rows.map((n) => {
              const Icon = ICON[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => n.href && router.push(n.href)}
                  disabled={!n.href}
                  className={cn(
                    "focus-ring flex w-full items-start gap-2.5 px-3 py-2.5 text-left",
                    "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)]",
                    "hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <Icon
                    strokeWidth={1.5}
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      n.read ? "text-muted-foreground" : "text-primary"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug">
                      {n.summary}
                    </span>
                    <span
                      className="mt-0.5 block font-mono text-[11px] text-muted-foreground tabular"
                      title={formatDateTime(n.createdAt)}
                    >
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                  {!n.read && (
                    <span
                      aria-hidden
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
