import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consumeVerificationToken } from "@/lib/tokens";
import { createSession } from "@/lib/auth";
import { originFromRequest } from "@/lib/origin";

export async function GET(req: NextRequest) {
  const origin = originFromRequest(req);
  const token = req.nextUrl.searchParams.get("token");
  if (!token)
    return NextResponse.redirect(`${origin}/login?error=missing`);

  const record = await consumeVerificationToken(token, "LOGIN");
  if (!record)
    return NextResponse.redirect(`${origin}/login?error=expired`);

  const user = await db.user.upsert({
    where: { email: record.email },
    update: {},
    create: { email: record.email },
  });

  // Auto-accept any pending team invites for this email.
  const invites = await db.teamInvite.findMany({
    where: { email: record.email, expiresAt: { gt: new Date() } },
  });
  for (const invite of invites) {
    await db.teamMember.upsert({
      where: { teamId_userId: { teamId: invite.teamId, userId: user.id } },
      update: {},
      create: { teamId: invite.teamId, userId: user.id, role: invite.role },
    });
    await db.teamInvite.delete({ where: { id: invite.id } });
  }

  await createSession(user.id);

  const hasTeam = await db.teamMember.findFirst({
    where: { userId: user.id },
  });
  return NextResponse.redirect(
    `${origin}${hasTeam ? "/dashboard" : "/onboarding"}`
  );
}
