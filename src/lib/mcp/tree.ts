import "server-only";
import type { Prisma, PermissionLevel } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessDataroom } from "@/lib/permissions";
import type { ApiPrincipal } from "@/lib/api-auth";
import { MAX_DEPTH, ToolError, parsePath } from "./context";

export type Tx = Prisma.TransactionClient;

/** Where a caller wants something to go: by folder id or by path, not both. */
export type FolderRef = { folderId?: string | null; folderPath?: string | null };

function refGiven(ref: FolderRef) {
  if (ref.folderId && ref.folderPath)
    throw new ToolError(
      "Give either folderId or folderPath, not both."
    );
}

export const sameName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

type Node = { id: string; parentId: string | null; name: string };

/** "Financials/2025" for a folder, by walking up its parents. */
export function pathOf(byId: Map<string, Node>, id: string | null): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let cursor = id;
  // `seen` stops a parent cycle in bad data from looping forever.
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) break;
    parts.unshift(node.name);
    cursor = node.parentId;
  }
  return parts.join("/");
}

/** True when `candidate` is `folderId` or sits somewhere beneath it. */
export function isWithin(
  byId: Map<string, Node>,
  candidate: string | null,
  folderId: string
): boolean {
  const seen = new Set<string>();
  let cursor = candidate;
  // Walks the whole chain, however deep: a cut-off here would let a folder
  // be moved under its own descendant and detach the subtree.
  while (cursor && !seen.has(cursor)) {
    if (cursor === folderId) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

/** How many levels down a folder sits: 1 at the top level. */
export function depthOf(byId: Map<string, Node>, id: string | null): number {
  let depth = 0;
  const seen = new Set<string>();
  let cursor = id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    depth++;
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return depth;
}

/** Levels in a folder's subtree, counting the folder itself. */
export function heightOf(nodes: Node[], id: string): number {
  const children = new Map<string | null, string[]>();
  for (const n of nodes)
    children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  const walk = (at: string, seen: Set<string>): number => {
    if (seen.has(at)) return 0;
    seen.add(at);
    return 1 + Math.max(0, ...(children.get(at) ?? []).map((c) => walk(c, seen)));
  };
  return walk(id, new Set());
}

/**
 * Refuse a move that would bury a folder deeper than paths can address, or
 * (through isWithin) under itself.
 */
export function assertMovable(
  nodes: Node[],
  byId: Map<string, Node>,
  folderId: string,
  newParentId: string | null
) {
  if (newParentId && isWithin(byId, newParentId, folderId))
    throw new ToolError(
      "A folder cannot be moved into itself or one of its own subfolders."
    );
  const resulting = depthOf(byId, newParentId) + heightOf(nodes, folderId);
  if (resulting > MAX_DEPTH)
    throw new ToolError(
      `That move would nest folders ${resulting} levels deep; the limit is ${MAX_DEPTH}. Move it somewhere shallower.`
    );
}

/**
 * Hold a lock on one folder tree (a room's, or a team's library) until the
 * transaction ends. Every change to a tree's shape takes it first, so two
 * moves cannot each pass the cycle check against the other's old position,
 * and two calls cannot each create the same missing folder.
 */
export async function lockTree(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`foyer-tree:${key}`}))`;
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(up + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** "04 Legal" and "legal" are the same word to a reader skimming a room. */
const core = (name: string) =>
  name.toLowerCase().replace(/^[\d\s._)-]+/, "").replace(/[^a-z0-9]+/g, "");

/** Could a reader, or a typo, take one of these names for the other? */
export function looksLike(a: string, b: string): boolean {
  const x = core(a);
  const y = core(b);
  if (x.length < 3 || y.length < 3) return x === y && x.length > 0;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  // Two edits covers a swapped pair of letters ("leagl") as well as a
  // dropped or doubled one. This only ever produces a hint or a warning, so
  // an occasional false match costs little.
  return distance(x, y) <= (Math.min(x.length, y.length) >= 5 ? 2 : 1);
}

/** The tail of a "no such folder" error: what is there, and the likely one. */
function among(part: string, siblings: { name: string }[], where: string): string {
  if (siblings.length === 0) return ` There are no folders ${where}.`;
  const close = siblings.find((s) => looksLike(s.name, part));
  const names = siblings.slice(0, 20).map((s) => `"${s.name}"`).join(", ");
  return `${close ? ` Did you mean "${close.name}"?` : ""} Folders ${where}: ${names}${siblings.length > 20 ? ", ..." : ""}.`;
}

// ---------- library ----------

/**
 * Resolve a library folder to its id (null = top level). With `create`, any
 * missing levels of a path are made; names match ignoring case so "legal" and
 * "Legal" are one folder.
 */
export async function resolveLibraryFolder(
  tx: Tx,
  teamId: string,
  ref: FolderRef,
  opts: { create: boolean; created?: string[] }
): Promise<string | null> {
  refGiven(ref);
  if (ref.folderId) {
    const folder = await tx.folder.findFirst({
      where: { id: ref.folderId, teamId },
      select: { id: true },
    });
    if (!folder)
      throw new ToolError(
        `No library folder with id ${ref.folderId}. Call list_library_folders to see the folders.`
      );
    return folder.id;
  }
  const parts = parsePath(ref.folderPath);
  let parentId: string | null = null;
  const walked: string[] = [];
  for (const part of parts) {
    walked.push(part);
    const siblings: { id: string; name: string }[] = await tx.folder.findMany({
      where: { teamId, parentId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    const found = siblings.find((s) => sameName(s.name, part));
    if (found) {
      parentId = found.id;
      continue;
    }
    if (!opts.create)
      throw new ToolError(
        `There is no library folder "${walked.join("/")}".${among(part, siblings, walked.length > 1 ? `in "${walked.slice(0, -1).join("/")}"` : "at the top level of the library")}`
      );
    const made: { id: string } = await tx.folder.create({
      data: { teamId, parentId, name: part },
      select: { id: true },
    });
    opts.created?.push(walked.join("/"));
    parentId = made.id;
  }
  return parentId;
}

// ---------- data rooms ----------

/**
 * Load a data room the key's owner may act on at `level`. A room they cannot
 * reach reads exactly like one that does not exist.
 */
export async function requireRoom(
  principal: ApiPrincipal,
  dataroomId: string,
  level: PermissionLevel
) {
  const room = await db.dataroom.findFirst({
    where: { id: dataroomId, teamId: principal.teamId },
  });
  if (!room || !(await canAccessDataroom(principal.ctx, dataroomId, "VIEW"))) {
    // Say so when the id is something else the caller can see: models mix
    // up ids, and "that is a document" saves a round of guessing.
    const { visibilityFor } = await import("@/lib/api-visibility");
    const v = await visibilityFor(principal);
    const isDoc = await db.document.findFirst({
      where: { AND: [{ id: dataroomId }, v.doc] },
      select: { id: true },
    });
    throw new ToolError(
      `No data room with id ${dataroomId}.${isDoc ? " That id is a document." : ""} Call list_datarooms to see the rooms this key can reach.`
    );
  }
  if (!(await canAccessDataroom(principal.ctx, dataroomId, level)))
    throw new ToolError(
      `The owner of this key can view the data room "${room.name}" but does not have ${level === "MANAGE" ? "manage" : "edit"} access to it. A workspace admin can change that under Settings > Members.`
    );
  return room;
}

/** Folders and documents in one directory share a single order sequence. */
export async function nextOrder(tx: Tx, dataroomId: string): Promise<number> {
  const [f, d] = await Promise.all([
    tx.dataroomFolder.aggregate({
      where: { dataroomId },
      _max: { orderIndex: true },
    }),
    tx.dataroomDocument.aggregate({
      where: { dataroomId },
      _max: { orderIndex: true },
    }),
  ]);
  return Math.max(f._max.orderIndex ?? 0, d._max.orderIndex ?? 0) + 1;
}

export async function resolveRoomFolder(
  tx: Tx,
  dataroomId: string,
  ref: FolderRef,
  opts: { create: boolean; created?: string[]; order?: { next: number } }
): Promise<string | null> {
  refGiven(ref);
  if (ref.folderId) {
    const folder = await tx.dataroomFolder.findFirst({
      where: { id: ref.folderId, dataroomId },
      select: { id: true },
    });
    if (!folder)
      throw new ToolError(
        `No folder with id ${ref.folderId} in this data room. Call get_dataroom to see its folders.`
      );
    return folder.id;
  }
  const parts = parsePath(ref.folderPath);
  let parentId: string | null = null;
  const walked: string[] = [];
  for (const part of parts) {
    walked.push(part);
    const siblings: { id: string; name: string }[] =
      await tx.dataroomFolder.findMany({
        where: { dataroomId, parentId },
        select: { id: true, name: true },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      });
    const found = siblings.find((s) => sameName(s.name, part));
    if (found) {
      parentId = found.id;
      continue;
    }
    if (!opts.create)
      throw new ToolError(
        `There is no folder "${walked.join("/")}" in this data room.${among(part, siblings, walked.length > 1 ? `in "${walked.slice(0, -1).join("/")}"` : "at the room's top level")}`
      );
    const order = opts.order ?? { next: await nextOrder(tx, dataroomId) };
    const made: { id: string } = await tx.dataroomFolder.create({
      data: { dataroomId, parentId, name: part, orderIndex: order.next++ },
      select: { id: true },
    });
    opts.created?.push(walked.join("/"));
    parentId = made.id;
  }
  return parentId;
}

export type RoomNode =
  | {
      kind: "folder";
      folderId: string;
      name: string;
      folderPath: string;
      children: RoomNode[];
    }
  | {
      kind: "document";
      documentId: string;
      name: string;
      type: string;
      pages: number | null;
    };

/** The room exactly as a visitor sees it: nested, in display order. */
export async function roomTree(dataroomId: string): Promise<{
  tree: RoomNode[];
  folders: number;
  documents: number;
}> {
  const [folders, docs] = await Promise.all([
    db.dataroomFolder.findMany({
      where: { dataroomId },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    }),
    db.dataroomDocument.findMany({
      where: { dataroomId },
      include: { document: { include: { currentVersion: true } } },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const build = (parentId: string | null, depth: number): RoomNode[] => {
    if (depth > 32) return [];
    const here: { order: number; at: number; node: RoomNode }[] = [];
    for (const f of folders)
      if (f.parentId === parentId)
        here.push({
          order: f.orderIndex,
          at: f.createdAt.getTime(),
          node: {
            kind: "folder",
            folderId: f.id,
            name: f.name,
            folderPath: pathOf(byId, f.id),
            children: build(f.id, depth + 1),
          },
        });
    for (const d of docs)
      // A document whose folder row is gone shows at the top level.
      if ((d.folderId && byId.has(d.folderId) ? d.folderId : null) === parentId)
        here.push({
          order: d.orderIndex,
          at: d.createdAt.getTime(),
          node: {
            kind: "document",
            documentId: d.documentId,
            name: d.document.name,
            type: d.document.type,
            pages: d.document.currentVersion?.numPages ?? null,
          },
        });
    return here
      .sort((a, b) => a.order - b.order || a.at - b.at)
      .map((h) => h.node);
  };
  return { tree: build(null, 0), folders: folders.length, documents: docs.length };
}
