import "server-only";
import { db } from "@/lib/db";
import type { TeamContext } from "@/lib/auth";
import type { PermissionLevel } from "@prisma/client";

const RANK: Record<PermissionLevel, number> = { VIEW: 1, EDIT: 2, MANAGE: 3 };

/**
 * Granular access: OWNER/ADMIN see everything. A MEMBER with no scoped
 * permissions also sees everything; once any dataroom permission is set,
 * they are restricted to those rooms at the granted level.
 *
 * Pass `level` to narrow to the rooms the caller holds at least that level on
 * (e.g. "EDIT" for the rooms they may add documents to).
 */
export async function accessibleDataroomIds(
  ctx: TeamContext,
  level: PermissionLevel = "VIEW"
): Promise<string[] | "all"> {
  if (ctx.role !== "MEMBER") return "all";
  const grants = await db.resourcePermission.findMany({
    where: { memberId: ctx.member.id, resourceType: "DATAROOM" },
  });
  if (grants.length === 0) return "all";
  return grants
    .filter((g) => RANK[g.level] >= RANK[level])
    .map((g) => g.resourceId);
}

export async function canAccessDataroom(
  ctx: TeamContext,
  dataroomId: string,
  level: PermissionLevel = "VIEW"
): Promise<boolean> {
  if (ctx.role !== "MEMBER") return true;
  const grants = await db.resourcePermission.findMany({
    where: { memberId: ctx.member.id, resourceType: "DATAROOM" },
  });
  if (grants.length === 0) return true;
  const grant = grants.find((g) => g.resourceId === dataroomId);
  return !!grant && RANK[grant.level] >= RANK[level];
}
