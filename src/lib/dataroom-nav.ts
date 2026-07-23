import { itemGrant, type FullLink } from "@/lib/access";

export type NavDoc = { itemId: string; name: string };

type Ordered = { orderIndex: number; createdAt: Date | string };

/**
 * Folders and documents of one directory level in their display order:
 * one shared orderIndex sequence, so files may precede folders. Ties (data
 * predating mixed ordering) fall back to folders-first, then age.
 */
export function interleave<F extends Ordered, D extends Ordered>(
  folders: F[],
  documents: D[]
): ({ kind: "folder"; item: F } | { kind: "document"; item: D })[] {
  const at = (x: Ordered) => +new Date(x.createdAt);
  return [
    ...folders.map((item) => ({ kind: "folder" as const, item })),
    ...documents.map((item) => ({ kind: "document" as const, item })),
  ].sort(
    (a, b) =>
      a.item.orderIndex - b.item.orderIndex ||
      (a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : 0) ||
      at(a.item) - at(b.item)
  );
}

/** interleave() over a FullLink dataroom's children of one parent. */
function linkChildren(link: FullLink, parentId: string | null) {
  const dataroom = link.dataroom!;
  return interleave(
    dataroom.folders.filter((f) => f.parentId === parentId),
    dataroom.documents.filter((d) => d.folderId === parentId)
  );
}

/**
 * The visitor-visible documents of a data room, flattened in the same order
 * as the index page (folders and files interleaved by their shared order at
 * each level, recursing into folders at their position), skipping anything
 * the link does not grant view on. Shared by the index and the per-document
 * prev/next controls so both agree on ordering.
 */
export function viewableDocOrder(link: FullLink): NavDoc[] {
  if (!link.dataroom) return [];
  const out: NavDoc[] = [];
  const walk = (parentId: string | null) => {
    for (const entry of linkChildren(link, parentId)) {
      if (entry.kind === "folder") {
        walk(entry.item.id);
      } else {
        if (!itemGrant(link, "DATAROOM_DOCUMENT", entry.item.id).canView)
          continue;
        out.push({ itemId: entry.item.id, name: entry.item.document.name });
      }
    }
  };
  walk(null);
  return out;
}

export type NavTreeNode =
  | { kind: "folder"; id: string; name: string; children: NavTreeNode[] }
  | { kind: "document"; itemId: string; name: string };

/**
 * The visitor-visible folder/document tree of a data room, filtered by the
 * link's grants. Folders with nothing viewable inside are dropped, matching
 * the index page. Feeds the explorer sidebars.
 */
export function viewableTree(link: FullLink): NavTreeNode[] {
  if (!link.dataroom) return [];
  const build = (parentId: string | null): NavTreeNode[] => {
    const out: NavTreeNode[] = [];
    for (const entry of linkChildren(link, parentId)) {
      if (entry.kind === "folder") {
        const children = build(entry.item.id);
        if (children.length)
          out.push({
            kind: "folder",
            id: entry.item.id,
            name: entry.item.name,
            children,
          });
      } else {
        if (!itemGrant(link, "DATAROOM_DOCUMENT", entry.item.id).canView)
          continue;
        out.push({
          kind: "document",
          itemId: entry.item.id,
          name: entry.item.document.name,
        });
      }
    }
    return out;
  };
  return build(null);
}
