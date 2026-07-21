import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { NotificationsClient } from "./notifications-client";

const KEYS = [
  {
    key: "document_viewed",
    group: "Documents",
    title: "Document viewed",
    caption: "When someone views a document link",
  },
  {
    key: "dataroom_visited",
    group: "Data rooms",
    title: "Data room visited",
    caption: "When someone visits a data room link",
  },
  {
    key: "file_uploaded",
    group: "Data rooms",
    title: "File uploaded",
    caption: "When new files land in a data room",
  },
  {
    key: "new_question",
    group: "Data rooms",
    title: "New question",
    caption: "When a visitor posts a question in a data room",
  },
  {
    key: "blocked_access",
    group: "Security",
    title: "Blocked access attempt",
    caption: "When a visitor is denied access to a link",
  },
  {
    key: "access_requested",
    group: "Security",
    title: "Access requested",
    caption: "When a blocked visitor asks the owner for access",
  },
  {
    key: "weekly_digest",
    group: "Digests",
    title: "Weekly digest",
    caption: "A Monday summary of visits and who is worth following up",
  },
];

export default async function NotificationsPage() {
  const ctx = await requireTeam();
  const prefs = await db.notificationPreference.findMany({
    where: { userId: ctx.user.id, teamId: ctx.team.id },
  });

  return (
    <NotificationsClient
      items={KEYS.map((k) => ({
        ...k,
        // Digests are opt-in; every other notification defaults on.
        enabled:
          prefs.find((p) => p.key === k.key)?.email ??
          k.key !== "weekly_digest",
      }))}
    />
  );
}
