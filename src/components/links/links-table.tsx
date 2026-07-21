"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
  FileText,
  FolderLock,
  MailPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyButton } from "@/components/shell/copy-button";
import { timeAgo } from "@/lib/format";
import {
  LinkEditor,
  type EditorLink,
  type TreeItem,
} from "@/components/links/link-editor";
import {
  InviteRecipientsDialog,
  type RecipientRow,
} from "@/components/links/invite-dialog";
import { setLinkArchived, deleteLink } from "@/app/(app)/links/actions";
import type { LinkConfig } from "@/lib/link-config";

export type LinkRowData = {
  id: string;
  name: string;
  url: string;
  displayUrl: string;
  targetType: "DOCUMENT" | "DATAROOM";
  targetId: string;
  targetName: string;
  views: number;
  lastViewed: string | null;
  isArchived: boolean;
  editor: EditorLink;
  tree: TreeItem[];
  recipients: RecipientRow[];
};

export type EditorContext = {
  appHost: string;
  domains: { id: string; domain: string }[];
  agreements: { id: string; name: string }[];
  presets: {
    id: string;
    name: string;
    isDefault: boolean;
    config: Partial<LinkConfig>;
  }[];
  previewPresets: { id: string; name: string; isDefault: boolean }[];
};

export function LinksTable({
  rows,
  ctx,
  showTarget = true,
}: {
  rows: LinkRowData[];
  ctx: EditorContext;
  showTarget?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Link</TableHead>
            {showTarget && <TableHead>Shares</TableHead>}
            <TableHead className="w-20">Views</TableHead>
            <TableHead className="w-28">Last viewed</TableHead>
            <TableHead className="w-20">Active</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <LinkRow key={row.id} row={row} ctx={ctx} showTarget={showTarget} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LinkRow({
  row,
  ctx,
  showTarget,
}: {
  row: LinkRowData;
  ctx: EditorContext;
  showTarget: boolean;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <span className="max-w-52 truncate font-mono text-xs text-muted-foreground">
            {row.displayUrl}
          </span>
          <CopyButton value={row.url} />
        </div>
      </TableCell>
      {showTarget && (
        <TableCell>
          <Link
            href={
              row.targetType === "DATAROOM"
                ? `/datarooms/${row.targetId}`
                : `/documents/${row.targetId}`
            }
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {row.targetType === "DATAROOM" ? (
              <FolderLock className="size-3.5" />
            ) : (
              <FileText className="size-3.5" />
            )}
            <span className="max-w-40 truncate">{row.targetName}</span>
          </Link>
        </TableCell>
      )}
      <TableCell className="tabular">{row.views}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.lastViewed ? timeAgo(row.lastViewed) : "—"}
      </TableCell>
      <TableCell>
        <Switch
          checked={!row.isArchived}
          onCheckedChange={async (v) => {
            await setLinkArchived(row.id, !v);
            toast.success(v ? "Link activated" : "Link deactivated");
            router.refresh();
          }}
        />
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <LinkEditor
            mode="edit"
            target={{
              type: row.targetType,
              id: row.targetId,
              name: row.targetName,
            }}
            link={row.editor}
            domains={ctx.domains}
            agreements={ctx.agreements}
            presets={ctx.presets}
            previewPresets={ctx.previewPresets}
            tree={row.tree}
            appHost={ctx.appHost}
            trigger={
              <Button variant="ghost" size="icon" className="size-7">
                <Pencil className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={row.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> Open link
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                <MailPlus className="size-4" /> Invite by email
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" /> Delete link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <InviteRecipientsDialog
          linkId={row.id}
          linkName={row.name}
          recipients={row.recipients}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{row.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                The link stops working immediately and its view history is
                removed. Consider deactivating instead to keep the analytics.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={async () => {
                  await deleteLink(row.id);
                  toast.success("Link deleted");
                  router.refresh();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
