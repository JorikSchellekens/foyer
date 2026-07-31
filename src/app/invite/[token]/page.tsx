import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUser, setActiveTeam } from "@/lib/auth";
import { FoyerLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Invitation" };

/** Cascade steps for the arrival; .stagger-item reads --i. */
const STEP = [0, 1, 2, 3].map((i) => ({ "--i": i }) as React.CSSProperties);

/**
 * The frame every outcome shares, so a dead invitation looks as considered as
 * a live one. Same column and rhythm as the sign-in page: this is the same
 * threshold, reached by a different door.
 */
function InviteShell({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-6 pb-24 pt-16">
        <div className="w-full max-w-sm">
          <span className="stagger-item block" style={STEP[0]}>
            <FoyerLogo size="lg" />
          </span>
          <h1
            className="stagger-item mt-10 font-display text-4xl leading-[1.08] tracking-tight text-balance"
            style={STEP[1]}
          >
            {title}
          </h1>
          <div
            className="stagger-item mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground"
            style={STEP[2]}
          >
            {children}
          </div>
          {actions && (
            <div
              className="stagger-item mt-8 flex flex-wrap items-center gap-3"
              style={STEP[3]}
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

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

  // Accepting an invitation deletes it, so an unknown token means the
  // invitation was already used, was withdrawn, or the address was mistyped.
  // Say all three plainly rather than calling it "expired".
  if (!invite) {
    return (
      <InviteShell
        title="This invitation has already been used"
        actions={
          <Button asChild size="lg" className="h-10 px-5">
            <Link href="/">Continue to Foyer</Link>
          </Button>
        }
      >
        <p>
          Invitation links work once. If you accepted it already, sign in and
          the workspace will be waiting for you.
        </p>
        <p>
          If you have not accepted it, the invitation may have been withdrawn:
          ask whoever invited you to send a new one.
        </p>
      </InviteShell>
    );
  }

  if (invite.expiresAt < new Date()) {
    return (
      <InviteShell
        title="This invitation has expired"
        actions={
          <Button asChild size="lg" className="h-10 px-5">
            <Link href="/">Continue to Foyer</Link>
          </Button>
        }
      >
        <p>
          Invitations to {invite.team.name} are good for a limited time. Ask an
          admin there to send a fresh one to {invite.email}; nothing else is
          needed from you.
        </p>
      </InviteShell>
    );
  }

  const user = await getUser();
  if (!user) redirect(`/login`);
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <InviteShell
        title="Signed in as another account"
        actions={
          <>
            {/* Signing out lands on the sign-in page; a link sent to the
                invited address picks this invitation up automatically. */}
            <form action="/api/auth/logout" method="post">
              <Button type="submit" size="lg" className="h-10 px-5">
                Sign out and switch account
              </Button>
            </form>
            <Button asChild size="lg" variant="ghost" className="h-10 px-4">
              <Link href="/">Stay signed in</Link>
            </Button>
          </>
        }
      >
        <p>
          This invitation to {invite.team.name} was sent to one address, and
          this browser is signed in as another. Sign out, then open the
          invitation from the invited inbox.
        </p>
        <span className="flex items-baseline text-xs">
          <span>Invited</span>
          <span aria-hidden className="leader-dots" />
          <span className="font-mono text-foreground">{invite.email}</span>
        </span>
        <span className="flex items-baseline text-xs">
          <span>Signed in</span>
          <span aria-hidden className="leader-dots" />
          <span className="font-mono text-foreground">{user.email}</span>
        </span>
      </InviteShell>
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
