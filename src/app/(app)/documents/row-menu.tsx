"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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

export function RowMenu({
  name,
  onRename,
  onDelete,
  deleteWarning,
  extraItems,
}: {
  name: string;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  deleteWarning: string;
  extraItems?: React.ReactNode;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [value, setValue] = useState(name);
  const router = useRouter();

  return (
    <>
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
          {extraItems}
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent
          className="sm:max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <form
            action={async () => {
              await onRename(value);
              setRenameOpen(false);
              router.refresh();
            }}
            className="space-y-4"
          >
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              required
            />
            <DialogFooter>
              <Button type="submit">Save name</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>{deleteWarning}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                await onDelete();
                router.refresh();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
