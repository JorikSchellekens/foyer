"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Folder, FolderOpen, Home } from "lucide-react";
import type { DocumentType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { FileIcon } from "@/components/shell/file-icon";
import {
  handleMoveDrop,
  hasMovePayload,
  startDocDrag,
  startFolderDrag,
} from "./dnd";

export type ExplorerDoc = {
  itemId: string; // DataroomDocument id
  documentId: string;
  name: string;
  type: DocumentType;
};

export type ExplorerFolder = {
  id: string;
  name: string;
  folders: ExplorerFolder[];
  docs: ExplorerDoc[];
};

/**
 * Tree explorer beside the contents table. Folders navigate (?folder=),
 * documents open their library page. Everything is draggable; folders and
 * the root row are drop targets, so files and folders can be re-filed
 * without leaving the tree.
 */
export function DataroomExplorer({
  dataroomId,
  currentFolderId,
  folders,
  docs,
}: {
  dataroomId: string;
  currentFolderId: string | null;
  folders: ExplorerFolder[];
  docs: ExplorerDoc[];
}) {
  const router = useRouter();

  // expand the path to the current folder on load
  const initialOpen = useMemo(() => {
    const open = new Set<string>();
    const walk = (nodes: ExplorerFolder[], trail: string[]): boolean => {
      for (const f of nodes) {
        if (
          f.id === currentFolderId ||
          walk(f.folders, [...trail, f.id])
        ) {
          for (const id of trail) open.add(id);
          open.add(f.id);
          return true;
        }
      }
      return false;
    };
    if (currentFolderId) walk(folders, []);
    return open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [open, setOpen] = useState<Set<string>>(initialOpen);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function onDrop(
    e: React.DragEvent,
    targetFolderId: string | null
  ) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    if (await handleMoveDrop(e, dataroomId, targetFolderId)) router.refresh();
  }

  const dropProps = (key: string | "root", folderId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!hasMovePayload(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget !== key) setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
    onDrop: (e: React.DragEvent) => onDrop(e, folderId),
  });

  const renderFolder = (f: ExplorerFolder, depth: number) => {
    const isOpen = open.has(f.id);
    const isCurrent = f.id === currentFolderId;
    const FolderGlyph = isOpen ? FolderOpen : Folder;
    return (
      <li key={f.id}>
        <div
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(e) => startFolderDrag(e, f.id)}
          onClick={() =>
            router.push(`/datarooms/${dataroomId}?folder=${f.id}`)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter")
              router.push(`/datarooms/${dataroomId}?folder=${f.id}`);
          }}
          {...dropProps(f.id, f.id)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-[13px] transition-colors hover:bg-muted/60",
            isCurrent && "bg-muted font-medium",
            dropTarget === f.id && "ring-2 ring-primary/60 bg-primary/5"
          )}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <button
            type="button"
            className="rounded p-0.5 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              toggle(f.id);
            }}
            aria-label={isOpen ? "Collapse folder" : "Expand folder"}
          >
            <ChevronRight
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                isOpen && "rotate-90"
              )}
            />
          </button>
          <FolderGlyph
            className="size-3.5 shrink-0 text-[#b7791f]"
            strokeWidth={1.5}
          />
          <span className="min-w-0 truncate">{f.name}</span>
        </div>
        {isOpen && (
          <ul>
            {f.folders.map((sub) => renderFolder(sub, depth + 1))}
            {f.docs.map((d) => renderDoc(d, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const renderDoc = (d: ExplorerDoc, depth: number) => (
    <li key={d.itemId}>
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => startDocDrag(e, d.itemId)}
        onClick={() => router.push(`/documents/${d.documentId}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(`/documents/${d.documentId}`);
        }}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        style={{ paddingLeft: 26 + depth * 14 }}
      >
        <FileIcon type={d.type} className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{d.name}</span>
      </div>
    </li>
  );

  return (
    <nav aria-label="Data room explorer" className="text-sm">
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/datarooms/${dataroomId}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(`/datarooms/${dataroomId}`);
        }}
        {...dropProps("root", null)}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted/60",
          currentFolderId === null && "bg-muted",
          dropTarget === "root" && "ring-2 ring-primary/60 bg-primary/5"
        )}
      >
        <Home className="size-3.5 text-muted-foreground" />
        All files
      </div>
      <ul className="mt-1">
        {folders.map((f) => renderFolder(f, 0))}
        {docs.map((d) => renderDoc(d, 0))}
      </ul>
    </nav>
  );
}
