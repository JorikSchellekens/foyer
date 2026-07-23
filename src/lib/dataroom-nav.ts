import { itemGrant, type FullLink } from "@/lib/access";

export type NavDoc = { itemId: string; name: string };

/**
 * The visitor-visible documents of a data room, flattened in the same order as
 * the index page (folders and their contents first, then loose documents at
 * each level), skipping anything the link does not grant view on. Shared by the
 * index and the per-document prev/next controls so both agree on ordering.
 */
export function viewableDocOrder(link: FullLink): NavDoc[] {
  const dataroom = link.dataroom;
  if (!dataroom) return [];
  const out: NavDoc[] = [];
  const walk = (parentId: string | null) => {
    for (const folder of dataroom.folders.filter((f) => f.parentId === parentId)) {
      walk(folder.id);
    }
    for (const item of dataroom.documents.filter((d) => d.folderId === parentId)) {
      if (!itemGrant(link, "DATAROOM_DOCUMENT", item.id).canView) continue;
      out.push({ itemId: item.id, name: item.document.name });
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
  const dataroom = link.dataroom;
  if (!dataroom) return [];
  const build = (parentId: string | null): NavTreeNode[] => {
    const out: NavTreeNode[] = [];
    for (const folder of dataroom.folders.filter(
      (f) => f.parentId === parentId
    )) {
      const children = build(folder.id);
      if (children.length)
        out.push({
          kind: "folder",
          id: folder.id,
          name: folder.name,
          children,
        });
    }
    for (const item of dataroom.documents.filter(
      (d) => d.folderId === parentId
    )) {
      if (!itemGrant(link, "DATAROOM_DOCUMENT", item.id).canView) continue;
      out.push({
        kind: "document",
        itemId: item.id,
        name: item.document.name,
      });
    }
    return out;
  };
  return build(null);
}
