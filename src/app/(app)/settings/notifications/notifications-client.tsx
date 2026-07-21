"use client";

import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { setNotificationPref } from "../actions";

export function NotificationsClient({
  items,
}: {
  items: {
    key: string;
    group: string;
    title: string;
    caption: string;
    enabled: boolean;
  }[];
}) {
  const router = useRouter();
  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <div className="max-w-lg space-y-8">
      <p className="text-sm text-muted-foreground">
        Choose which email notifications you receive for this workspace. Your
        teammates set their own.
      </p>
      {groups.map((group) => (
        <section key={group}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group}
          </h2>
          <div className="space-y-4">
            {items
              .filter((i) => i.group === group)
              .map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.caption}
                    </div>
                  </div>
                  <Switch
                    defaultChecked={item.enabled}
                    onCheckedChange={async (v) => {
                      await setNotificationPref(item.key, v);
                      router.refresh();
                    }}
                  />
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
