import type { DragEvent } from "react";
import { toast } from "sonner";
import { moveDocument, moveFolder } from "./actions";

// Custom MIME types carry the payload kind so dragover can accept/reject
// without reading the data (which HTML5 DnD only allows on drop).
export const LIB_DOC_MIME = "application/x-foyer-lib-doc";
export const LIB_FOLDER_MIME = "application/x-foyer-lib-folder";

export function startLibDocDrag(e: DragEvent, documentId: string) {
  e.dataTransfer.setData(LIB_DOC_MIME, documentId);
  e.dataTransfer.effectAllowed = "move";
}

export function startLibFolderDrag(e: DragEvent, folderId: string) {
  e.dataTransfer.setData(LIB_FOLDER_MIME, folderId);
  e.dataTransfer.effectAllowed = "move";
}

export function hasLibMovePayload(e: DragEvent) {
  const t = e.dataTransfer.types;
  return t.includes(LIB_DOC_MIME) || t.includes(LIB_FOLDER_MIME);
}

/**
 * Drop a dragged library document or folder into targetFolderId
 * (null = root). Returns true when something moved.
 */
export async function handleLibMoveDrop(
  e: DragEvent,
  targetFolderId: string | null
): Promise<boolean> {
  const docId = e.dataTransfer.getData(LIB_DOC_MIME);
  if (docId) {
    await moveDocument(docId, targetFolderId);
    toast.success("Moved");
    return true;
  }
  const folderId = e.dataTransfer.getData(LIB_FOLDER_MIME);
  if (folderId) {
    if (folderId === targetFolderId) return false;
    const res = await moveFolder(folderId, targetFolderId);
    if (res && "error" in res && res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success("Moved");
    return true;
  }
  return false;
}
