"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Folder as FolderIcon } from "lucide-react";
import type { DocumentType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { FileIcon } from "@/components/shell/file-icon";
import { formatBytes, timeAgo, pluralize } from "@/lib/format";
import { docTypeLabel } from "@/lib/doc-types";
import { RowMenu } from "./row-menu";
import { ShareMenuItem } from "@/components/links/quick-share";
import {
  renameDocument,
  deleteDocument,
  renameFolder,
  deleteFolder,
} from "./actions";
import {
  handleLibMoveDrop,
  hasLibMovePayload,
  startLibDocDrag,
  startLibFolderDrag,
} from "./dnd";

/**
 * Breadcrumb link that also accepts a dragged file/folder, moving it into
 * the crumb's folder (null = root).
 */
export function LibCrumbDropLink({
  folderId,
  href,
  className,
  children,
}: {
  folderId: string | null;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        router.push(href);
      }}
      onDragOver={(e) => {
        if (!hasLibMovePayload(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        if (await handleLibMoveDrop(e, folderId)) router.refresh();
      }}
      className={cn(
        className,
        over && "rounded-sm bg-primary/10 ring-2 ring-primary/60"
      )}
    >
      {children}
    </a>
  );
}

export function FolderRow({
  folder,
}: {
  folder: { id: string; name: string; itemCount: number };
}) {
  const router = useRouter();
  const [dropOver, setDropOver] = useState(false);
  return (
    <TableRow
      className={cn(
        "cursor-pointer",
        dropOver && "bg-primary/5 ring-2 ring-inset ring-primary/60"
      )}
      draggable
      onDragStart={(e) => startLibFolderDrag(e, folder.id)}
      onDragOver={(e) => {
        if (!hasLibMovePayload(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropOver(true);
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDropOver(false);
        if (await handleLibMoveDrop(e, folder.id)) router.refresh();
      }}
      onClick={() => router.push(`/documents?folder=${folder.id}`)}
    >
      <TableCell>
        <div className="flex items-center gap-2.5">
          <FolderIcon className="size-4 text-[#b7791f]" strokeWidth={1.5} />
          <span className="font-medium">{folder.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">Folder</TableCell>
      <TableCell className="text-muted-foreground">
        {pluralize(folder.itemCount, "item")}
      </TableCell>
      <TableCell />
      <TableCell />
      <TableCell className="text-right">
        <RowMenu
          name={folder.name}
          onRename={async (n) => {
            await renameFolder(folder.id, n);
          }}
          onDelete={async () => {
            await deleteFolder(folder.id);
          }}
          deleteWarning="Documents inside will also be deleted, along with their links and analytics. This cannot be undone."
        />
      </TableCell>
    </TableRow>
  );
}

export function DocumentRow({
  doc,
}: {
  doc: {
    id: string;
    name: string;
    type: DocumentType;
    size: number;
    linkCount: number;
    viewCount: number;
    updatedAt: string;
  };
}) {
  const router = useRouter();
  return (
    <TableRow
      className="group cursor-pointer"
      draggable
      onDragStart={(e) => startLibDocDrag(e, doc.id)}
      onClick={() => router.push(`/documents/${doc.id}`)}
    >
      <TableCell>
        <div className="flex items-center gap-2.5">
          <FileIcon type={doc.type} />
          <span className="font-medium">{doc.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {docTypeLabel(doc.type)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {doc.type === "NOTION" ? "—" : formatBytes(doc.size)}
      </TableCell>
      <TableCell className="tabular text-muted-foreground">
        {doc.linkCount}
      </TableCell>
      <TableCell className="tabular text-muted-foreground">
        {doc.viewCount}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        <div className="flex items-center justify-end gap-1">
          <span className="text-xs">{timeAgo(doc.updatedAt)}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
            title="Preview"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/documents/${doc.id}/preview`);
            }}
          >
            <Eye className="size-3.5" />
          </Button>
          <RowMenu
            name={doc.name}
            onRename={async (n) => {
              await renameDocument(doc.id, n);
            }}
            onDelete={async () => {
              await deleteDocument(doc.id);
            }}
            deleteWarning="All versions, links and analytics for this document will be permanently removed."
            extraItems={
              <ShareMenuItem target={{ type: "DOCUMENT", id: doc.id }} />
            }
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
