import type { DragEvent } from "react";
import { toast } from "sonner";
import { moveDataroomFolder, moveDataroomItem } from "../actions";

// Custom MIME types carry the payload kind so dragover can accept/reject
// without reading the data (which HTML5 DnD only allows on drop).
export const DR_DOC_MIME = "application/x-foyer-dr-doc";
export const DR_FOLDER_MIME = "application/x-foyer-dr-folder";

export function startDocDrag(e: DragEvent, dataroomDocumentId: string) {
  e.dataTransfer.setData(DR_DOC_MIME, dataroomDocumentId);
  e.dataTransfer.effectAllowed = "move";
}

export function startFolderDrag(e: DragEvent, folderId: string) {
  e.dataTransfer.setData(DR_FOLDER_MIME, folderId);
  e.dataTransfer.effectAllowed = "move";
}

export function hasMovePayload(e: DragEvent) {
  const t = e.dataTransfer.types;
  return t.includes(DR_DOC_MIME) || t.includes(DR_FOLDER_MIME);
}

/**
 * Drop a dragged document or folder into targetFolderId (null = root).
 * Returns true when something moved, so the caller can refresh.
 */
export async function handleMoveDrop(
  e: DragEvent,
  dataroomId: string,
  targetFolderId: string | null
): Promise<boolean> {
  const docId = e.dataTransfer.getData(DR_DOC_MIME);
  if (docId) {
    await moveDataroomItem(dataroomId, docId, targetFolderId);
    toast.success("Moved");
    return true;
  }
  const folderId = e.dataTransfer.getData(DR_FOLDER_MIME);
  if (folderId) {
    if (folderId === targetFolderId) return false;
    const res = await moveDataroomFolder(dataroomId, folderId, targetFolderId);
    if (res && "error" in res && res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success("Moved");
    return true;
  }
  return false;
}
