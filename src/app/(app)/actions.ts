"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, setActiveTeam } from "@/lib/auth";
import { db } from "@/lib/db";

export async function switchTeam(teamId: string) {
  const user = await requireUser();
  const member = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: user.id } },
  });
  if (!member) return;
  await setActiveTeam(teamId);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
