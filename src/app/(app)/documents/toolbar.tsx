"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderPlus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFolder, createNotionDocument } from "./actions";

export function NewFolderDialog({ parentId }: { parentId: string | null }) {
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
            const res = await createFolder(name, parentId);
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
          <div className="space-y-2">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q3 Reports"
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit">Create folder</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddNotionDialog({ folderId }: { folderId: string | null }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
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
        </DialogHeader>
        <form
          action={async () => {
            const res = await createNotionDocument(url, folderId);
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            toast.success("Notion page added");
            setOpen(false);
            setUrl("");
            router.refresh();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="notion-url">Public Notion URL</Label>
            <Input
              id="notion-url"
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
            <Button type="submit">Add page</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
