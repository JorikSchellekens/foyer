/* Demo-deployment entry point: lands a reviewer straight in the app without a
   magic link. It exists only for demo deployments and is completely inert
   unless DEMO_LOGIN_EMAIL is set - without that variable this route 404s before
   it touches the database. Unlike a magic link it is reusable, so one shared
   review URL keeps working. Never set DEMO_LOGIN_EMAIL on a real deployment. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { originFromRequest } from "@/lib/origin";

export async function GET(req: NextRequest) {
  const email = process.env.DEMO_LOGIN_EMAIL?.toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const origin = originFromRequest(req);
  const user = await db.user.findUnique({ where: { email } });
  if (!user)
    return NextResponse.redirect(`${origin}/login?error=demo-user-missing`);

  await createSession(user.id);

  const hasTeam = await db.teamMember.findFirst({ where: { userId: user.id } });
  return NextResponse.redirect(
    `${origin}${hasTeam ? "/dashboard" : "/onboarding"}`
  );
}
