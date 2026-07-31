"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SettingsIntro, SettingsRow, SettingsSection } from "../section";
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
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const groups = [...new Set(items.map((i) => i.group))];

  function toggle(key: string, value: boolean) {
    setSaved(null);
    startTransition(async () => {
      await setNotificationPref(key, value);
      setSaved(key);
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="Notifications"
        description="Which email notifications you receive for this workspace. Your teammates set their own."
      />

      {groups.map((group, gi) => (
        <SettingsSection
          key={group}
          title={group}
          bodyClassName="divide-y py-1"
          footer={
            gi === groups.length - 1
              ? "Each switch saves as you flip it."
              : undefined
          }
        >
          {items
            .filter((i) => i.group === group)
            .map((item) => (
              <SettingsRow
                key={item.key}
                htmlFor={`notify-${item.key}`}
                descriptionId={`notify-${item.key}-hint`}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    {item.title}
                    {saved === item.key && !pending && (
                      <Check
                        className="tick-in size-3 text-primary"
                        strokeWidth={2.5}
                        aria-label="Saved"
                      />
                    )}
                  </span>
                }
                description={item.caption}
                control={
                  <Switch
                    id={`notify-${item.key}`}
                    aria-describedby={`notify-${item.key}-hint`}
                    defaultChecked={item.enabled}
                    onCheckedChange={(v) => toggle(item.key, v)}
                  />
                }
              />
            ))}
        </SettingsSection>
      ))}
    </div>
  );
}
