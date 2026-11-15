import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ApiPrincipal } from "@/lib/api-auth";

/**
 * What a key may see and change, as query filters.
 *
 * Most members can reach the whole workspace. A member who has been given
 * access to specific data rooms only is "restricted", and a key of theirs is
 * confined to those rooms: the documents in them, the links to them, and the
 * visits through those links. This is deliberately tighter than the web app,
 * where the library is open to every member: a key is something that gets
 * pasted into other software, so it gets the narrower reading of "this person
 * may only work in these rooms".
 *
 * Documents a restricted member uploaded themselves stay theirs to see and
 * change until someone places them in a room the member cannot reach.
 */
export type Visibility = {
  restricted: boolean;
  /** Room ids by level, or "all". */
  viewRooms: string[] | "all";
  editRooms: string[] | "all";
  manageRooms: string[] | "all";
  room: Prisma.DataroomWhereInput;
  doc: Prisma.DocumentWhereInput;
  docEdit: Prisma.DocumentWhereInput;
  docDelete: Prisma.DocumentWhereInput;
  link: Prisma.LinkWhereInput;
  linkEdit: Prisma.LinkWhereInput;
  view: Prisma.ViewWhereInput;
};

const RANK = { VIEW: 1, EDIT: 2, MANAGE: 3 } as const;

export async function visibilityFor(principal: ApiPrincipal): Promise<Visibility> {
  const teamId = principal.teamId;
  const open: Visibility = {
    restricted: false,
    viewRooms: "all",
    editRooms: "all",
    manageRooms: "all",
    room: { teamId },
    doc: { teamId },
    docEdit: { teamId },
    docDelete: { teamId },
    link: { teamId },
    linkEdit: { teamId },
    view: { link: { teamId } },
  };
  if (principal.ctx.role !== "MEMBER") return open;
  const grants = await db.resourcePermission.findMany({
    where: { memberId: principal.ctx.member.id, resourceType: "DATAROOM" },
  });
  if (grants.length === 0) return open;

  const at = (level: keyof typeof RANK) =>
    grants.filter((g) => RANK[g.level] >= RANK[level]).map((g) => g.resourceId);
  const viewRooms = at("VIEW");
  const editRooms = at("EDIT");
  const manageRooms = at("MANAGE");

  const own: Prisma.DocumentWhereInput = {
    versions: { some: { versionNumber: 1, uploadedById: principal.userId } },
  };
  /** In at least one of `rooms` (or the caller's own), and in none outside. */
  const within = (rooms: string[]): Prisma.DocumentWhereInput => ({
    teamId,
    dataroomDocs: { every: { dataroomId: { in: rooms } } },
    OR: [{ dataroomDocs: { some: { dataroomId: { in: rooms } } } }, own],
  });
  const doc: Prisma.DocumentWhereInput = {
    teamId,
    OR: [
      { dataroomDocs: { some: { dataroomId: { in: viewRooms } } } },
      { ...own, dataroomDocs: { every: { dataroomId: { in: viewRooms } } } },
    ],
  };
  const docEdit = within(editRooms);
  // Deleting is for a document the member brought in themselves, and only
  // while every room it sits in is one they manage. Managing a room is not
  // enough: otherwise editing one room could be turned into deleting its
  // documents by first moving them into a room of one's own.
  const docDelete: Prisma.DocumentWhereInput = {
    teamId,
    ...own,
    dataroomDocs: { every: { dataroomId: { in: manageRooms } } },
  };
  const link: Prisma.LinkWhereInput = {
    teamId,
    OR: [
      { dataroomId: { in: viewRooms } },
      { dataroomId: null, document: { is: doc } },
    ],
  };
  const linkEdit: Prisma.LinkWhereInput = {
    teamId,
    OR: [
      { dataroomId: { in: editRooms } },
      { dataroomId: null, document: { is: docEdit } },
    ],
  };
  return {
    restricted: true,
    viewRooms,
    editRooms,
    manageRooms,
    room: { teamId, id: { in: viewRooms } },
    doc,
    docEdit,
    docDelete,
    link,
    linkEdit,
    view: { link: link },
  };
}

export function roomVisible(v: Visibility, dataroomId: string) {
  return v.viewRooms === "all" || v.viewRooms.includes(dataroomId);
}


/** A link is live when it is switched on and has not expired. */
export function liveLink(now = new Date()): Prisma.LinkWhereInput {
  return {
    isArchived: false,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}
