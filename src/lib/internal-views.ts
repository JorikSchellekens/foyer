import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Emails of everyone on the team - the accounts that sign into Foyer. */
export async function teamMemberEmails(teamId: string): Promise<string[]> {
  const members = await db.teamMember.findMany({
    where: { teamId },
    select: { user: { select: { email: true } } },
  });
  return members.map((m) => m.user.email.toLowerCase());
}

/**
 * A `View` filter that drops "internal" visits: any view whose email belongs
 * to a team member. Anonymous (null-email) views are always external and kept.
 * Feed it the list from `teamMemberEmails()`. An empty list means no filtering.
 *
 * The explicit `viewerEmail: null` branch matters: a bare `NOT { OR [...] }`
 * evaluates to NULL (and so excludes the row) for null emails under SQL
 * three-valued logic, which would silently drop anonymous public visitors.
 */
export function externalViews(emails: string[]): Prisma.ViewWhereInput {
  if (emails.length === 0) return {};
  return {
    OR: [
      { viewerEmail: null },
      {
        NOT: {
          OR: emails.map((email) => ({
            viewerEmail: { equals: email, mode: "insensitive" as const },
          })),
        },
      },
    ],
  };
}
