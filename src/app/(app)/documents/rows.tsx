"use client";

import { useRouter } from "next/navigation";
import { Folder as FolderIcon } from "lucide-react";
import type { DocumentType } from "@prisma/client";
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

export function FolderRow({
  folder,
}: {
  folder: { id: string; name: string; itemCount: number };
}) {
  const router = useRouter();
  return (
    <TableRow
      className="cursor-pointer"
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
      className="cursor-pointer"
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
