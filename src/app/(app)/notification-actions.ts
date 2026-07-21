"use server";

import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";

export type NotificationRow = {
  id: string;
  type: string;
  summary: string;
  href: string | null;
  createdAt: string;
  read: boolean;
};

type Payload = {
  who?: string | null;
  itemName?: string;
  linkName?: string;
  detail?: string;
  href?: string;
};

function summarize(type: string, p: Payload): string {
  const who = p.who ?? "Someone";
  switch (type) {
    case "document_viewed":
      return `${who} viewed ${p.itemName ?? "a document"}`;
    case "dataroom_visited":
      return `${who} visited ${p.itemName ?? "a data room"}`;
    case "file_uploaded":
      return `New file in ${p.itemName ?? "a data room"}`;
    case "new_question":
      return `${p.who ?? "A visitor"} asked a question in ${p.itemName ?? "a data room"}`;
    case "blocked_access":
      return `Blocked access on ${p.linkName ?? "a link"}`;
    case "access_requested":
      return `${p.who ?? "Someone"} requested access to ${p.linkName ?? "a link"}`;
    default:
      return type.replace(/_/g, " ");
  }
}

export async function loadNotifications(): Promise<{
  rows: NotificationRow[];
  unread: number;
}> {
  const ctx = await requireTeam();
  const [notifications, unread] = await Promise.all([
    db.notification.findMany({
      where: { teamId: ctx.team.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.notification.count({
      where: { teamId: ctx.team.id, readAt: null },
    }),
  ]);
  return {
    unread,
    rows: notifications.map((n): NotificationRow => {
      const p = (n.payload ?? {}) as Payload;
      return {
        id: n.id,
        type: n.type,
        summary: summarize(n.type, p),
        href: p.href ?? null,
        createdAt: n.createdAt.toISOString(),
        read: n.readAt !== null,
      };
    }),
  };
}

export async function markNotificationsRead(): Promise<void> {
  const ctx = await requireTeam();
  await db.notification.updateMany({
    where: { teamId: ctx.team.id, readAt: null },
    data: { readAt: new Date() },
  });
}
