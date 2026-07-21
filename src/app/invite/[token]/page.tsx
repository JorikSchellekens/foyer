import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUser, setActiveTeam } from "@/lib/auth";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await db.teamInvite.findUnique({
    where: { token },
    include: { team: true },
  });

  if (!invite || invite.expiresAt < new Date()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-3xl">Invitation expired</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Ask a workspace admin to send a fresh invitation.
          </p>
        </div>
      </main>
    );
  }

  const user = await getUser();
  if (!user) redirect(`/login`);
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-3xl">Wrong account</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This invitation is for {invite.email}, but you are signed in as{" "}
            {user.email}. Sign out and use the invited address.
          </p>
        </div>
      </main>
    );
  }

  await db.teamMember.upsert({
    where: { teamId_userId: { teamId: invite.teamId, userId: user.id } },
    update: {},
    create: { teamId: invite.teamId, userId: user.id, role: invite.role },
  });
  await db.teamInvite.delete({ where: { id: invite.id } });
  await setActiveTeam(invite.teamId);
  redirect("/dashboard");
}
