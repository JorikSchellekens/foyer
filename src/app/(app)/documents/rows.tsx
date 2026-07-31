"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Folder as FolderIcon } from "lucide-react";
import type { DocumentType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { FileIcon } from "@/components/shell/file-icon";
import { formatBytes, formatDateTime, timeAgo, pluralize } from "@/lib/format";
import { docTypeLabel } from "@/lib/doc-types";
import { RowMenu } from "./row-menu";
import { RowCheckbox } from "./selection";
import { DataroomCell, type RoomOption, type RoomRef } from "./dataroom-picker";
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
        "rounded-sm outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] focus-visible:ring-3 focus-visible:ring-ring",
        className,
        over && "bg-primary/10 ring-2 ring-primary/60"
      )}
    >
      {children}
    </a>
  );
}

/** Row shell: click-anywhere, mount reveal; TableRow owns the hover wash. */
const ROW = "stagger-item group cursor-pointer";
/** The name is the row's real link, so keyboard users get a visible target. */
const NAME_LINK =
  "-mx-1 rounded-md px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring";
const META = "py-2.5 text-[0.8125rem] text-muted-foreground";
/** Counts, sizes and dates: mono and tabular so the columns align optically. */
const NUM = "py-2.5 font-mono text-[0.8125rem] text-muted-foreground tabular";

/** Cap the cascade: a long library should not ripple for seconds. */
function stagger(index: number) {
  return { "--i": Math.min(index, 10) } as React.CSSProperties;
}

export function FolderRow({
  folder,
  index = 0,
}: {
  folder: { id: string; name: string; itemCount: number };
  index?: number;
}) {
  const router = useRouter();
  const [dropOver, setDropOver] = useState(false);
  const href = `/documents?folder=${folder.id}`;
  return (
    <TableRow
      className={cn(
        ROW,
        dropOver && "bg-primary/5 ring-2 ring-inset ring-primary/60"
      )}
      style={stagger(index)}
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
      onClick={() => router.push(href)}
    >
      {/* Selection column: folders are not selectable, so this stays a spacer. */}
      <TableCell className="py-2.5" />
      <TableCell className="py-2.5">
        <div className="flex items-center gap-2.5">
          <FolderIcon
            className="size-4 shrink-0 text-[#b7791f]"
            strokeWidth={1.5}
            aria-hidden
          />
          <Link
            href={href}
            // The row is the drag source: an anchor is draggable by default and
            // would hijack the gesture, so opt it out.
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className={cn(NAME_LINK, "font-medium")}
          >
            {folder.name}
          </Link>
        </div>
      </TableCell>
      <TableCell className={META}>Folder</TableCell>
      <TableCell className={META}>
        {pluralize(folder.itemCount, "item")}
      </TableCell>
      <TableCell />
      <TableCell />
      {/* Data rooms column: only documents belong to rooms. */}
      <TableCell />
      <TableCell className="py-2.5 text-right">
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
  rooms,
  memberOf,
  index = 0,
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
  rooms: RoomOption[];
  memberOf: RoomRef[];
  index?: number;
}) {
  const router = useRouter();
  const href = `/documents/${doc.id}`;
  return (
    <TableRow
      className={ROW}
      style={stagger(index)}
      draggable
      onDragStart={(e) => startLibDocDrag(e, doc.id)}
      onClick={() => router.push(href)}
    >
      <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
        <RowCheckbox id={doc.id} name={doc.name} />
      </TableCell>
      <TableCell className="py-2.5">
        <div className="flex items-center gap-2.5">
          <FileIcon type={doc.type} />
          <Link
            href={href}
            // The row is the drag source: an anchor is draggable by default and
            // would hijack the gesture, so opt it out.
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className={cn(NAME_LINK, "font-medium")}
          >
            {doc.name}
          </Link>
        </div>
      </TableCell>
      <TableCell className={META}>{docTypeLabel(doc.type)}</TableCell>
      <TableCell className={NUM}>
        {doc.type === "NOTION" ? (
          <span aria-hidden>-</span>
        ) : (
          formatBytes(doc.size)
        )}
      </TableCell>
      <TableCell className={NUM}>{doc.linkCount}</TableCell>
      <TableCell className={NUM}>{doc.viewCount}</TableCell>
      <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
        <DataroomCell documentId={doc.id} rooms={rooms} memberOf={memberOf} />
      </TableCell>
      <TableCell className="py-2.5 text-right">
        <div className="flex items-center justify-end gap-0.5">
          <time
            dateTime={doc.updatedAt}
            title={formatDateTime(doc.updatedAt)}
            className="mr-1 font-mono text-xs text-muted-foreground tabular"
          >
            {timeAgo(doc.updatedAt)}
          </time>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Preview ${doc.name}`}
            title="Preview"
            // Quiet until the row is engaged; the overflow menu stays put so
            // there is always one visible way in, touch included.
            className="opacity-0 transition-opacity duration-[var(--dur)] ease-[var(--ease-out-soft)] group-hover:opacity-100 focus-visible:opacity-100"
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
