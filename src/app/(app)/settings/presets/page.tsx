import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { PresetsClient } from "./presets-client";
import type { LinkConfig } from "@/lib/link-config";

export default async function PresetsPage() {
  const ctx = await requireTeam();
  const presets = await db.linkPreset.findMany({
    where: { teamId: ctx.team.id },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return (
    <PresetsClient
      presets={presets.map((p) => ({
        id: p.id,
        name: p.name,
        isDefault: p.isDefault,
        config: p.config as Partial<LinkConfig>,
      }))}
    />
  );
}
