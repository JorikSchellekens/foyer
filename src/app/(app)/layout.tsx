import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { CommandPalette } from "@/components/shell/command-palette";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTeam();
  const memberships = await db.teamMember.findMany({
    where: { userId: ctx.user.id },
    include: { team: true },
    orderBy: { createdAt: "asc" },
  });
  const teams = memberships.map((m) => ({
    id: m.team.id,
    name: m.team.name,
  }));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <MobileNav
        teams={teams}
        activeTeamId={ctx.team.id}
        userEmail={ctx.user.email}
      />
      <Sidebar
        teams={teams}
        activeTeamId={ctx.team.id}
        userEmail={ctx.user.email}
      />
      <main className="min-w-0 flex-1">{children}</main>
      <CommandPalette />
    </div>
  );
}
