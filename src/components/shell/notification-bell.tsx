"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Eye, FolderInput, FileUp, MessageCircle, ShieldX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timeAgo } from "@/lib/format";
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
        className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        title="Notifications"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">
          Notifications
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Views and questions will show up here.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {rows.map((n) => {
              const Icon = ICON[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => n.href && router.push(n.href)}
                  disabled={!n.href}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-default",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug">
                      {n.summary}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                  {!n.read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
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
