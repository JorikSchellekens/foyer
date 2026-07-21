import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { MembersClient } from "./members-client";

export default async function MembersPage() {
  const ctx = await requireTeam();
  const [members, invites, datarooms] = await Promise.all([
    db.teamMember.findMany({
      where: { teamId: ctx.team.id },
      include: { user: true, permissions: true },
      orderBy: { createdAt: "asc" },
    }),
    db.teamInvite.findMany({
      where: { teamId: ctx.team.id },
      orderBy: { createdAt: "desc" },
    }),
    db.dataroom.findMany({
      where: { teamId: ctx.team.id },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <MembersClient
      currentUserId={ctx.user.id}
      role={ctx.role}
      members={members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
        permissions: m.permissions.map((p) => ({
          resourceType: p.resourceType,
          resourceId: p.resourceId,
          level: p.level,
        })),
      }))}
      invites={invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
      }))}
      datarooms={datarooms.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
