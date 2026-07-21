"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { createDataroom } from "./actions";

export function NewDataroomDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New data room
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New data room</DialogTitle>
        </DialogHeader>
        <form
          action={async () => {
            const res = await createDataroom(name, description || undefined);
            if ("error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            setOpen(false);
            router.push(`/datarooms/${res.id}`);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="dr-name">Name</Label>
            <Input
              id="dr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Series A — Due Diligence"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dr-desc">Description (optional)</Label>
            <Textarea
              id="dr-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to your team, not to visitors."
            />
          </div>
          <DialogFooter>
            <Button type="submit">Create data room</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
