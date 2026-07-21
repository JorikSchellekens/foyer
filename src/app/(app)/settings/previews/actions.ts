"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";

export async function savePreviewPreset(preset: {
  id?: string;
  name: string;
  isDefault: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaImageKey: string | null;
}) {
  const ctx = await requireTeam();
  if (!preset.name.trim()) return { error: "Give the preview a name." };
  if (preset.isDefault) {
    await db.previewPreset.updateMany({
      where: { teamId: ctx.team.id },
      data: { isDefault: false },
    });
  }
  const data = {
    name: preset.name.trim(),
    isDefault: preset.isDefault,
    metaTitle: preset.metaTitle,
    metaDescription: preset.metaDescription,
    metaImageKey: preset.metaImageKey,
  };
  if (preset.id) {
    await db.previewPreset.updateMany({
      where: { id: preset.id, teamId: ctx.team.id },
      data,
    });
  } else {
    await db.previewPreset.create({ data: { ...data, teamId: ctx.team.id } });
  }
  revalidatePath("/settings/previews");
  return { ok: true };
}

export async function deletePreviewPreset(presetId: string) {
  const ctx = await requireTeam();
  await db.previewPreset.deleteMany({
    where: { id: presetId, teamId: ctx.team.id },
  });
  revalidatePath("/settings/previews");
}
