import { requireTeam } from "@/lib/auth";
import { GeneralForm } from "./general-form";

export default async function GeneralSettingsPage() {
  const ctx = await requireTeam();
  return (
    <GeneralForm
      teamName={ctx.team.name}
      teamSlug={ctx.team.slug}
      role={ctx.role}
      userEmail={ctx.user.email}
    />
  );
}
