import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { PreviewsClient } from "./previews-client";

export default async function PreviewsPage() {
  const ctx = await requireTeam();
  const presets = await db.previewPreset.findMany({
    where: { teamId: ctx.team.id },
    include: { _count: { select: { links: true } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return (
    <PreviewsClient
      presets={presets.map((p) => ({
        id: p.id,
        name: p.name,
        isDefault: p.isDefault,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription,
        metaImageKey: p.metaImageKey,
        linkCount: p._count.links,
      }))}
    />
  );
}
