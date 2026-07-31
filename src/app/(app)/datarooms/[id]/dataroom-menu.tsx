"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateDataroom, deleteDataroom } from "../actions";

export function DataroomMenu({
  dataroom,
}: {
  dataroom: { id: string; name: string; description: string | null };
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(dataroom.name);
  const [description, setDescription] = useState(dataroom.description ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty =
    name !== dataroom.name || description !== (dataroom.description ?? "");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Actions for ${dataroom.name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`/api/datarooms/${dataroom.id}/download`}>
              <Download className="size-4" /> Download all (zip)
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" /> Delete data room
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          className="sm:max-w-sm"
          onInteractOutside={(e) => {
            if (dirty) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit data room</DialogTitle>
          </DialogHeader>
          <form
            action={async () => {
              setSaving(true);
              try {
                await updateDataroom(dataroom.id, {
                  name,
                  description: description || null,
                });
                toast.success("Data room updated");
                setEditOpen(false);
                router.refresh();
              } finally {
                setSaving(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="dr-name">Name</Label>
              <Input
                id="dr-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-description">Description</Label>
              <Textarea
                id="dr-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Internal only. Visitors never see this.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !name.trim() || !dirty}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{dataroom.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              All links into this data room stop working and its visit history
              is removed. Library documents themselves are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async (e) => {
                // Keep the dialog up while the delete runs, so the click has
                // visible consequence rather than a silent pause.
                e.preventDefault();
                setDeleting(true);
                await deleteDataroom(dataroom.id);
                toast.success("Data room deleted");
                router.push("/datarooms");
              }}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {deleting ? "Deleting…" : `Delete ${dataroom.name}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
