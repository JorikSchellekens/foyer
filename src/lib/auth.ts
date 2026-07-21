import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Team, TeamMember, TeamRole, User } from "@prisma/client";

const SESSION_COOKIE = "foyer_session";
const TEAM_COOKIE = "foyer_team";
const SESSION_DAYS = 30;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signPayload(
  payload: Record<string, unknown>,
  expiresIn: string = `${SESSION_DAYS}d`
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verifyPayload<T = Record<string, unknown>>(
  token: string
): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const token = await signPayload({ sub: userId });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 3600,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(TEAM_COOKIE);
}

export const getUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyPayload<{ sub?: string }>(token);
  if (!payload?.sub) return null;
  return db.user.findUnique({ where: { id: payload.sub } });
});

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export type TeamContext = {
  user: User;
  team: Team;
  member: TeamMember;
  role: TeamRole;
};

/** Resolve the active team from cookie, falling back to the first membership. */
export const getTeamContext = cache(async (): Promise<TeamContext | null> => {
  const user = await getUser();
  if (!user) return null;
  const store = await cookies();
  const teamId = store.get(TEAM_COOKIE)?.value;
  const memberships = await db.teamMember.findMany({
    where: { userId: user.id },
    include: { team: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;
  const member =
    memberships.find((m) => m.teamId === teamId) ?? memberships[0];
  return { user, team: member.team, member, role: member.role };
});

export async function requireTeam(): Promise<TeamContext> {
  const user = await getUser();
  if (!user) redirect("/login");
  const ctx = await getTeamContext();
  if (!ctx) redirect("/onboarding");
  return ctx;
}

export async function requireRole(
  roles: TeamRole[] = ["OWNER", "ADMIN"]
): Promise<TeamContext> {
  const ctx = await requireTeam();
  if (!roles.includes(ctx.role)) redirect("/dashboard");
  return ctx;
}

export async function setActiveTeam(teamId: string) {
  const store = await cookies();
  store.set(TEAM_COOKIE, teamId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 3600,
    path: "/",
  });
}
