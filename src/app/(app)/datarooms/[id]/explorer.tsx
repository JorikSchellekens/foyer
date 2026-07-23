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

export type ExplorerNode =
  | {
      kind: "folder";
      id: string;
      name: string;
      children: ExplorerNode[];
    }
  | {
      kind: "doc";
      itemId: string; // DataroomDocument id
      documentId: string;
      name: string;
      type: DocumentType;
    };

/**
 * Tree explorer beside the contents table, in the same interleaved order as
 * the table and the visitor index. Folders navigate (?folder=), documents
 * open their library page. Everything is draggable; folders and the root
 * row are drop targets, so files and folders can be re-filed without
 * leaving the tree.
 */
export function DataroomExplorer({
  dataroomId,
  currentFolderId,
  nodes,
}: {
  dataroomId: string;
  currentFolderId: string | null;
  nodes: ExplorerNode[];
}) {
  const router = useRouter();

  // expand the path to the current folder on load
  const initialOpen = useMemo(() => {
    const open = new Set<string>();
    const walk = (items: ExplorerNode[], trail: string[]): boolean => {
      for (const n of items) {
        if (n.kind !== "folder") continue;
        if (n.id === currentFolderId || walk(n.children, [...trail, n.id])) {
          for (const id of trail) open.add(id);
          open.add(n.id);
          return true;
        }
      }
      return false;
    };
    if (currentFolderId) walk(nodes, []);
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

  async function onDrop(e: React.DragEvent, targetFolderId: string | null) {
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

  const renderNode = (node: ExplorerNode, depth: number) => {
    if (node.kind === "doc") {
      return (
        <li key={`d-${node.itemId}`}>
          <div
            role="button"
            tabIndex={0}
            draggable
            onDragStart={(e) => startDocDrag(e, node.itemId)}
            onClick={() => router.push(`/documents/${node.documentId}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                router.push(`/documents/${node.documentId}`);
            }}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            style={{ paddingLeft: 26 + depth * 14 }}
          >
            <FileIcon type={node.type} className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">{node.name}</span>
          </div>
        </li>
      );
    }
    const isOpen = open.has(node.id);
    const isCurrent = node.id === currentFolderId;
    const FolderGlyph = isOpen ? FolderOpen : Folder;
    return (
      <li key={`f-${node.id}`}>
        <div
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(e) => startFolderDrag(e, node.id)}
          onClick={() =>
            router.push(`/datarooms/${dataroomId}?folder=${node.id}`)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter")
              router.push(`/datarooms/${dataroomId}?folder=${node.id}`);
          }}
          {...dropProps(node.id, node.id)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-[13px] transition-colors hover:bg-muted/60",
            isCurrent && "bg-muted font-medium",
            dropTarget === node.id && "ring-2 ring-primary/60 bg-primary/5"
          )}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <button
            type="button"
            className="rounded p-0.5 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
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
          <span className="min-w-0 truncate">{node.name}</span>
        </div>
        {isOpen && (
          <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

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
      <ul className="mt-1">{nodes.map((n) => renderNode(n, 0))}</ul>
    </nav>
  );
}
