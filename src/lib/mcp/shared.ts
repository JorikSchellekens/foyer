import "server-only";
import type { Link, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ApiPrincipal } from "@/lib/api-auth";
import { liveLink, roomVisible, type Visibility } from "@/lib/api-visibility";
import { ToolError, publicLinkUrl } from "./context";

/** Every sharing link is described the same way, wherever it appears. */
export function linkOut(
  l: Link & {
    domain?: { domain: string } | null;
    document?: { id: string; name: string } | null;
    dataroom?: { id: string; name: string } | null;
  }
) {
  const expired = !!l.expiresAt && l.expiresAt <= new Date();
  return {
    linkId: l.id,
    name: l.name,
    url: publicLinkUrl(l),
    status: l.isArchived ? "archived" : expired ? "expired" : "active",
    ...(l.document
      ? { shares: { documentId: l.document.id, name: l.document.name } }
      : l.dataroom
        ? { shares: { dataroomId: l.dataroom.id, name: l.dataroom.name } }
        : {}),
    accessMode: l.accessMode,
    hasPassword: !!l.passwordHash,
    allowDownload: l.allowDownload,
    watermark: l.watermark,
    screenshotProtection: l.screenshotProtection,
    expiresAt: l.expiresAt,
    allowList: l.allowList,
    blockList: l.blockList,
    whoCanEnter: whoCanEnter(l),
    // A link that shows only part of a room is not changed by adding
    // documents: new items stay hidden until granted in the web app.
    ...(l.dataroomId ? { showsWholeRoom: l.fullAccess } : {}),
  };
}

/** The plain answer to "who can open this?", from the settings combined. */
function whoCanEnter(l: Link): string {
  if (l.isArchived) return "Nobody: the link is archived.";
  if (l.expiresAt && l.expiresAt <= new Date()) return "Nobody: the link has expired.";
  const pw = l.passwordHash ? ", and who has the password" : "";
  const blocked = l.blockList.length ? ` Blocked: ${l.blockList.join(", ")}.` : "";
  if (l.accessMode === "PUBLIC" && !l.allowList.length)
    return `Anyone with the URL${pw}.${blocked}`;
  const who = l.allowList.length
    ? `at ${l.allowList.join(", ")}`
    : "(any address)";
  return l.accessMode === "EMAIL_VERIFIED"
    ? `Only people who prove they own an email address ${who}${pw}.${blocked}`
    : `Anyone who types an email address ${who}${pw}; the address is not checked.${blocked}`;
}

/**
 * When an id is not what the tool expected, say what it is, if the caller is
 * allowed to know. Models mix up ids; "that is a data room" saves a round of
 * guessing. Nothing outside the caller's own reach is ever confirmed.
 */
export async function whatIs(p: ApiPrincipal, v: Visibility, id: string): Promise<string> {
  const [doc, room, folder, roomFolder, link] = await Promise.all([
    db.document.findFirst({ where: { AND: [{ id }, v.doc] }, select: { id: true } }),
    db.dataroom.findFirst({ where: { AND: [{ id }, v.room] }, select: { id: true } }),
    v.restricted
      ? null
      : db.folder.findFirst({ where: { id, teamId: p.teamId }, select: { id: true } }),
    db.dataroomFolder.findFirst({
      where: { id, dataroom: v.room },
      select: { id: true },
    }),
    db.link.findFirst({ where: { AND: [{ id }, v.link] }, select: { id: true } }),
  ]);
  if (doc) return " That id is a document.";
  if (room) return " That id is a data room.";
  if (folder) return " That id is a library folder.";
  if (roomFolder) return " That id is a folder inside a data room.";
  if (link) return " That id is a sharing link.";
  return "";
}

const DOC_INCLUDE = { currentVersion: true } satisfies Prisma.DocumentInclude;

/** A document the key may see, change or delete; otherwise "no such document". */
export async function requireDoc(
  p: ApiPrincipal,
  v: Visibility,
  documentId: string,
  level: "view" | "edit" | "delete" = "view"
) {
  const visible = await db.document.findFirst({
    where: { AND: [{ id: documentId }, v.doc] },
    include: DOC_INCLUDE,
  });
  if (!visible)
    throw new ToolError(
      `No document with id ${documentId}.${await whatIs(p, v, documentId)} Call list_documents to find documents.`
    );
  if (level !== "view") {
    const allowed = await db.document.findFirst({
      where: { AND: [{ id: documentId }, level === "edit" ? v.docEdit : v.docDelete] },
      select: { id: true },
    });
    if (!allowed)
      throw new ToolError(
        `The owner of this key can see "${visible.name}" but may not ${level === "edit" ? "change" : "delete"} it: their access is limited to specific data rooms, and this document is not theirs to ${level === "edit" ? "change" : "delete"}. A workspace admin can change that under Settings > Members.`
      );
  }
  return visible;
}

export async function requireLink(
  p: ApiPrincipal,
  v: Visibility,
  linkId: string,
  edit = false
) {
  const link = await db.link.findFirst({
    where: { AND: [{ id: linkId }, v.link] },
    include: {
      domain: true,
      document: { select: { id: true, name: true } },
      dataroom: { select: { id: true, name: true } },
      team: { select: { name: true } },
    },
  });
  if (!link)
    throw new ToolError(
      `No sharing link with id ${linkId}.${await whatIs(p, v, linkId)} Call list_sharing_links to find links.`
    );
  if (edit) {
    const ok = await db.link.findFirst({
      where: { AND: [{ id: linkId }, v.linkEdit] },
      select: { id: true },
    });
    if (!ok)
      throw new ToolError(
        `The owner of this key can see the link "${link.name}" but does not have edit access to what it shares.`
      );
  }
  return link;
}

/** Library filing is for members who can reach the whole workspace. */
export function requireLibrary(v: Visibility, what: string) {
  if (v.restricted)
    throw new ToolError(
      `${what} is not available to this key: its owner's access is limited to specific data rooms, and the library's folders span the whole workspace. Work inside the data rooms from list_datarooms instead.`
    );
}

/**
 * Changing what people outside the team can already see is sharing, whatever
 * tool does it. A room with a live link, or a document reachable through one,
 * can only be changed by a key that has the "share" permission: adding to it,
 * renaming in it, rearranging it, removing from it, replacing a file. So a
 * key that was only given "organise" cannot alter anything a visitor sees,
 * by any route. It can still build and arrange rooms that are not shared yet.
 */
export async function requireShareForShared(
  p: ApiPrincipal,
  target: { dataroomId?: string | null; documentIds?: string[] },
  doing: string
) {
  if (p.scopes.includes("share")) return;
  const now = new Date();
  let live = 0;
  let what = "";
  if (target.dataroomId) {
    live = await db.link.count({
      where: { dataroomId: target.dataroomId, ...liveLink(now) },
    });
    what = "this data room is";
  }
  if (!live && target.documentIds?.length) {
    live = await db.link.count({
      where: {
        ...liveLink(now),
        OR: [
          { documentId: { in: target.documentIds } },
          {
            dataroom: {
              documents: { some: { documentId: { in: target.documentIds } } },
            },
          },
        ],
      },
    });
    what =
      target.documentIds.length === 1
        ? "this document is"
        : "at least one of these documents is";
  }
  if (live > 0)
    throw new ToolError(
      `${doing} would change what outside visitors see: ${what} shared through an active sharing link. This key may not do that (can.changeWhatIsAlreadyShared is false; see get_workspace). Nothing was changed. Tell the user: they can make this change in the Foyer web app, or create a key with the "Organise and share" access level. Rooms and documents that are not shared yet can still be changed with this key.`
    );
}

export { roomVisible };
