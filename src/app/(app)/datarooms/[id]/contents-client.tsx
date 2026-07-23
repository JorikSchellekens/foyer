"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  Eye,
  FileUp,
  Folder,
  FolderPlus,
  FolderUp,
  GripVertical,
  Library,
  Loader2,
  Trash2,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileIcon } from "@/components/shell/file-icon";
import {
  putWithProgress,
  useLeaveGuard,
  UploadingOverlay,
  type UploadProgress,
} from "@/components/upload/uploader";
import { formatBytes, timeAgo, pluralize } from "@/lib/format";
import {
  addDocumentsToDataroom,
  addNotionToDataroom,
  createDataroomFolder,
  deleteDataroomFolder,
  renameDataroomFolder,
  removeFromDataroom,
  reorderDataroomDocuments,
  reorderDataroomFolders,
  uploadIntoDataroom,
} from "../actions";
import type { UploadedFile } from "@/app/(app)/documents/actions";
import {
  DR_FOLDER_MIME,
  handleMoveDrop,
  hasMovePayload,
  startDocDrag,
  startFolderDrag,
} from "./dnd";

/**
 * Breadcrumb link that also accepts a dragged file/folder, moving it into
 * the crumb's folder (null = root).
 */
export function CrumbDropLink({
  dataroomId,
  folderId,
  href,
  className,
  children,
}: {
  dataroomId: string;
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
        if (!hasMovePayload(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        if (await handleMoveDrop(e, dataroomId, folderId)) router.refresh();
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

// ---------- toolbar ----------

export function NewDrFolderButton({
  dataroomId,
  parentId,
}: {
  dataroomId: string;
  parentId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderPlus className="size-4" /> New folder
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
        </DialogHeader>
        <form
          action={async () => {
            const res = await createDataroomFolder(dataroomId, name, parentId);
            if (res?.error) {
              toast.error(res.error);
              return;
            }
            setOpen(false);
            setName("");
            router.refresh();
          }}
          className="space-y-4"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Financials"
            autoFocus
            required
          />
          <DialogFooter>
            <Button type="submit">Create folder</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddNotionToDataroomDialog({
  dataroomId,
  folderId,
}: {
  dataroomId: string;
  folderId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <BookOpen className="size-4" /> Add Notion page
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a Notion page</DialogTitle>
          <DialogDescription>
            Link a published Notion page so your team can keep editing it in
            Notion while visitors always see the latest version.
          </DialogDescription>
        </DialogHeader>
        <form
          action={async () => {
            setBusy(true);
            try {
              const res = await addNotionToDataroom(dataroomId, url, folderId);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Notion page added");
              setOpen(false);
              setUrl("");
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="dr-notion-url">Public Notion URL</Label>
            <Input
              id="dr-notion-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourteam.notion.site/Page-abc123"
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              The page must be published to the web in Notion. Visitors get a
              live, tracked preview.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Adding
                </>
              ) : (
                "Add page"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DataroomUploadButtons({
  dataroomId,
  folderId,
}: {
  dataroomId: string;
  folderId: string | null;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<UploadProgress>(null);
  useLeaveGuard(progress !== null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  async function handle(fileList: FileList) {
    const files = Array.from(fileList).filter(
      (f) => f.size > 0 && !f.name.startsWith(".")
    );
    if (!files.length) return;
    setProgress({ done: 0, total: files.length, pct: 0 });
    try {
      const res = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({
            name: f.name,
            contentType: f.type || "application/octet-stream",
          })),
        }),
      });
      if (!res.ok) throw new Error("Could not prepare the upload.");
      const { files: signed } = await res.json();

      const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
      const loaded = new Array(files.length).fill(0);
      const uploads: UploadedFile[] = [];
      let done = 0;
      const report = () => {
        const sum = loaded.reduce((s: number, n: number) => s + n, 0);
        setProgress({
          done,
          total: files.length,
          pct: Math.min(100, Math.round((sum / totalBytes) * 100)),
        });
      };
      let next = 0;
      const runOne = async () => {
        while (next < files.length) {
          const i = next++;
          await putWithProgress(signed[i].url, files[i], (b) => {
            loaded[i] = b;
            report();
          });
          const rel = (files[i] as File & { webkitRelativePath?: string })
            .webkitRelativePath;
          const relDir = rel ? rel.split("/").slice(0, -1).join("/") : "";
          uploads.push({
            key: signed[i].key,
            name: files[i].name,
            size: files[i].size,
            contentType: files[i].type || "application/octet-stream",
            relativeDir: relDir,
          });
          done++;
          report();
        }
      };
      await Promise.all(Array.from({ length: 4 }, runOne));

      const result = await uploadIntoDataroom(dataroomId, uploads, folderId);
      if (result && "error" in result && result.error)
        throw new Error(result.error);
      toast.success(`Added ${files.length} file${files.length === 1 ? "" : "s"}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => e.target.files && handle(e.target.files)}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        // @ts-expect-error non-standard folder upload attribute
        webkitdirectory=""
        onChange={(e) => e.target.files && handle(e.target.files)}
      />
      <Button
        variant="outline"
        onClick={() => folderInput.current?.click()}
        disabled={!!progress}
      >
        <FolderUp className="size-4" /> Upload folder
      </Button>
      <Button onClick={() => fileInput.current?.click()} disabled={!!progress}>
        {progress ? (
          <>
            <Loader2 className="size-4 animate-spin" /> {progress.pct}%
          </>
        ) : (
          <>
            <FileUp className="size-4" /> Upload files
          </>
        )}
      </Button>
      <UploadingOverlay progress={progress} />
    </>
  );
}

export function AddFromLibraryDialog({
  dataroomId,
  folderId,
  library,
}: {
  dataroomId: string;
  folderId: string | null;
  library: { id: string; name: string; type: DocumentType; path: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const filtered = library.filter((d) =>
    `${d.path}/${d.name}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(new Set());
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Library className="size-4" /> Add from library
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add from library</DialogTitle>
          <DialogDescription>
            Reuse documents you have already uploaded. They stay in sync with
            new versions.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents…"
        />
        <ScrollArea className="h-64 rounded-md border">
          <div className="p-1.5">
            {filtered.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No matching documents.
              </p>
            )}
            {filtered.map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60"
              >
                <Checkbox
                  checked={selected.has(d.id)}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v === true) next.add(d.id);
                    else next.delete(d.id);
                    setSelected(next);
                  }}
                />
                <FileIcon type={d.type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{d.name}</span>
                  {d.path && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {d.path}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button
            disabled={selected.size === 0 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await addDocumentsToDataroom(
                  dataroomId,
                  [...selected],
                  folderId
                );
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success(`Added ${pluralize(selected.size, "document")}`);
                setOpen(false);
                router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            Add {selected.size > 0 ? selected.size : ""} selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- rows ----------

export type DrFolderItem = { id: string; name: string; itemCount: number };

type FolderDropZone = "before" | "into" | "after";

/**
 * Sibling folders of the current directory. A dragged folder dropped on the
 * middle of a row nests inside it; dropped near a row's top or bottom edge
 * it reorders among its siblings (the file-manager convention). Dragged
 * documents always nest.
 */
export function FolderRows({
  dataroomId,
  folders,
}: {
  dataroomId: string;
  folders: DrFolderItem[];
}) {
  const [order, setOrder] = useState(folders);
  const [target, setTarget] = useState<{
    id: string;
    zone: FolderDropZone;
  } | null>(null);
  const router = useRouter();

  function zoneOf(e: React.DragEvent): FolderDropZone {
    // only sibling folders reorder; documents always file into the folder
    if (!e.dataTransfer.types.includes(DR_FOLDER_MIME)) return "into";
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    if (y < 0.25) return "before";
    if (y > 0.75) return "after";
    return "into";
  }

  async function onDrop(e: React.DragEvent, folder: DrFolderItem) {
    e.preventDefault();
    const zone = zoneOf(e);
    setTarget(null);
    if (zone === "into") {
      if (await handleMoveDrop(e, dataroomId, folder.id)) router.refresh();
      return;
    }
    const draggedId = e.dataTransfer.getData(DR_FOLDER_MIME);
    if (!draggedId || draggedId === folder.id) return;
    const from = order.findIndex((f) => f.id === draggedId);
    if (from < 0) return; // dragged in from elsewhere; only edges of siblings reorder
    const next = [...order];
    const [moved] = next.splice(from, 1);
    let to = next.findIndex((f) => f.id === folder.id);
    if (zone === "after") to += 1;
    next.splice(to, 0, moved);
    setOrder(next);
    reorderDataroomFolders(
      dataroomId,
      next.map((f) => f.id)
    ).then(() => router.refresh());
  }

  return (
    <>
      {order.map((folder) => (
        <DrFolderRow
          key={folder.id}
          dataroomId={dataroomId}
          folder={folder}
          dropZone={target?.id === folder.id ? target.zone : null}
          onZone={(zone) =>
            setTarget(zone === null ? null : { id: folder.id, zone })
          }
          zoneOf={zoneOf}
          onDropRow={(e) => onDrop(e, folder)}
        />
      ))}
    </>
  );
}

function DrFolderRow({
  dataroomId,
  folder,
  dropZone,
  onZone,
  zoneOf,
  onDropRow,
}: {
  dataroomId: string;
  folder: DrFolderItem;
  dropZone: FolderDropZone | null;
  onZone: (zone: FolderDropZone | null) => void;
  zoneOf: (e: React.DragEvent) => FolderDropZone;
  onDropRow: (e: React.DragEvent) => void;
}) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(folder.name);
  return (
    <TableRow
      className={cn(
        "cursor-pointer",
        dropZone === "into" && "bg-primary/5 ring-2 ring-inset ring-primary/60",
        dropZone === "before" && "border-t-2 border-t-primary",
        dropZone === "after" && "border-b-2 border-b-primary"
      )}
      draggable
      onDragStart={(e) => startFolderDrag(e, folder.id)}
      onDragEnd={() => onZone(null)}
      onDragOver={(e) => {
        if (!hasMovePayload(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onZone(zoneOf(e));
      }}
      onDragLeave={() => onZone(null)}
      onDrop={onDropRow}
      onClick={() =>
        router.push(`/datarooms/${dataroomId}?folder=${folder.id}`)
      }
    >
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Folder className="size-4 text-[#b7791f]" strokeWidth={1.5} />
          <span className="font-medium">{folder.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {pluralize(folder.itemCount, "item")}
      </TableCell>
      <TableCell />
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>
              <Pencil className="size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                await deleteDataroomFolder(dataroomId, folder.id);
                router.refresh();
              }}
            >
              <Trash2 className="size-4" /> Remove folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent
            className="sm:max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <DialogHeader>
              <DialogTitle>Rename folder</DialogTitle>
            </DialogHeader>
            <form
              action={async () => {
                await renameDataroomFolder(dataroomId, folder.id, name);
                setRenameOpen(false);
                router.refresh();
              }}
              className="space-y-4"
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <DialogFooter>
                <Button type="submit">Save name</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

export type DrDocItem = {
  id: string; // DataroomDocument id
  documentId: string;
  name: string;
  type: DocumentType;
  size: number;
  addedAt: string;
};

/**
 * Documents in the current folder, drag-reorderable. Position becomes the
 * visitor-facing index order (orderIndex), persisted on drop. Keyed by the id
 * set from the server so add/remove remounts with fresh data while a reorder
 * keeps local state.
 */
export function ReorderableDocRows({
  dataroomId,
  items,
}: {
  dataroomId: string;
  items: DrDocItem[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function drop(targetId: string) {
    setOverId(null);
    if (!dragId || dragId === targetId) return;
    const from = order.findIndex((o) => o.id === dragId);
    const to = order.findIndex((o) => o.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    setDragId(null);
    reorderDataroomDocuments(
      dataroomId,
      next.map((o) => o.id)
    ).then(() => router.refresh());
  }

  return (
    <>
      {order.map((item) => (
        <TableRow
          key={item.id}
          draggable
          onDragStart={(e) => {
            setDragId(item.id);
            // also carry the move payload so folders and the explorer
            // tree can receive this row
            startDocDrag(e, item.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(e) => {
            if (!dragId) return; // reorder is only for drags started here
            e.preventDefault();
            if (overId !== item.id) setOverId(item.id);
          }}
          onDrop={() => drop(item.id)}
          className={cn(
            "group cursor-pointer transition-colors",
            dragId === item.id && "opacity-40",
            overId === item.id && dragId && dragId !== item.id
              ? "border-t-2 border-primary"
              : ""
          )}
          onClick={() => router.push(`/documents/${item.documentId}`)}
        >
          <TableCell>
            <div className="flex items-center gap-2.5">
              <GripVertical
                className="size-4 shrink-0 cursor-grab text-muted-foreground/40 transition-colors group-hover:text-muted-foreground active:cursor-grabbing"
                onClick={(e) => e.stopPropagation()}
              />
              <FileIcon type={item.type} />
              <span className="font-medium">{item.name}</span>
            </div>
          </TableCell>
          <TableCell className="text-muted-foreground">
            {item.type === "NOTION" ? "Notion" : formatBytes(item.size)}
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">
            added {timeAgo(item.addedAt)}
          </TableCell>
          <TableCell className="text-right">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
              title="Preview"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/documents/${item.documentId}/preview`);
              }}
            >
              <Eye className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Remove from data room"
              onClick={async (e) => {
                e.stopPropagation();
                await removeFromDataroom(dataroomId, item.id);
                toast.success("Removed from data room");
                router.refresh();
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
