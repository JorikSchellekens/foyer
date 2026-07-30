"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderLock, Loader2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { pluralize } from "@/lib/format";
import {
  addDocumentsToDatarooms,
  createDataroom,
  removeDocumentsFromDataroom,
} from "@/app/(app)/datarooms/actions";

export type RoomOption = { id: string; name: string; canEdit: boolean };
export type RoomRef = { id: string; name: string };

/**
 * Membership toggle for one or many documents. `counts[roomId]` is how many of
 * the target documents are already in that room, so the bulk case can show a
 * mixed state.
 */
export function DataroomPicker({
  documentIds,
  rooms,
  counts,
  align = "end",
  onDone,
  children,
}: {
  documentIds: string[];
  rooms: RoomOption[];
  counts: Record<string, number>;
  align?: "start" | "end";
  onDone?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [busyRoom, setBusyRoom] = useState<string | null>(null);

  // Optimistic overrides, dropped whenever fresh server data arrives.
  const signature = JSON.stringify(counts);
  const [snapshot, setSnapshot] = useState(signature);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  if (signature !== snapshot) {
    setSnapshot(signature);
    setOverrides({});
  }

  const total = documentIds.length;
  const stateOf = (roomId: string): "all" | "some" | "none" => {
    const override = overrides[roomId];
    if (override !== undefined) return override ? "all" : "none";
    const n = counts[roomId] ?? 0;
    return n === 0 ? "none" : n >= total ? "all" : "some";
  };

  function toggle(room: RoomOption) {
    if (!room.canEdit || pending) return;
    const next = stateOf(room.id) !== "all";
    setOverrides((o) => ({ ...o, [room.id]: next }));
    setBusyRoom(room.id);
    startTransition(async () => {
      const res = next
        ? await addDocumentsToDatarooms(documentIds, [room.id])
        : await removeDocumentsFromDataroom(room.id, documentIds);
      setBusyRoom(null);
      if (res && "error" in res && res.error) {
        setOverrides((o) => {
          const rest = { ...o };
          delete rest[room.id];
          return rest;
        });
        toast.error(res.error);
        return;
      }
      toast.success(
        next
          ? `Added ${pluralize(total, "document")} to ${room.name}`
          : `Removed from ${room.name}`
      );
      router.refresh();
      onDone?.();
    });
  }

  function createAndAdd(name: string) {
    setBusyRoom("__new__");
    startTransition(async () => {
      const created = await createDataroom(name.trim());
      if ("error" in created) {
        setBusyRoom(null);
        toast.error(created.error);
        return;
      }
      const res = await addDocumentsToDatarooms(documentIds, [created.id]);
      setBusyRoom(null);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setQuery("");
      toast.success(
        `Created ${name.trim()} and added ${pluralize(total, "document")}`
      );
      router.refresh();
      onDone?.();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-72 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput
            placeholder="Search data rooms…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="p-2">
              {query.trim() ? (
                <Button
                  variant="ghost"
                  className="w-full justify-start font-normal"
                  disabled={pending}
                  onClick={() => createAndAdd(query)}
                >
                  {busyRoom === "__new__" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Create “{query.trim()}” and add
                </Button>
              ) : (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No data rooms yet.
                </p>
              )}
            </CommandEmpty>
            <CommandGroup>
              {rooms.map((room) => {
                const state = stateOf(room.id);
                return (
                  <CommandItem
                    key={room.id}
                    value={room.name}
                    disabled={!room.canEdit || pending}
                    onSelect={() => toggle(room)}
                    title={
                      room.canEdit
                        ? undefined
                        : "You do not have edit access to this data room"
                    }
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border",
                        state === "none"
                          ? "border-input"
                          : "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      {busyRoom === room.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : state === "all" ? (
                        <Check className="size-3" />
                      ) : state === "some" ? (
                        <Minus className="size-3" />
                      ) : null}
                    </span>
                    <span className="truncate">{room.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Documents-table cell: membership at a glance, click to change it. */
export function DataroomCell({
  documentId,
  rooms,
  memberOf,
}: {
  documentId: string;
  rooms: RoomOption[];
  memberOf: RoomRef[];
}) {
  const shown = memberOf.slice(0, 2);
  const rest = memberOf.slice(2);
  const counts = Object.fromEntries(memberOf.map((r) => [r.id, 1]));

  return (
    <DataroomPicker documentIds={[documentId]} rooms={rooms} counts={counts}>
      <button
        type="button"
        className="-mx-1.5 flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        title="Data rooms"
      >
        {memberOf.length === 0 ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Plus className="size-3" /> Add
          </span>
        ) : (
          <>
            {shown.map((r) => (
              <Badge key={r.id} variant="secondary" className="max-w-28">
                <span className="truncate">{r.name}</span>
              </Badge>
            ))}
            {rest.length > 0 && (
              <Badge
                variant="outline"
                title={rest.map((r) => r.name).join(", ")}
              >
                +{rest.length}
              </Badge>
            )}
          </>
        )}
      </button>
    </DataroomPicker>
  );
}

/** Document detail page: the rooms this document lives in, with add/remove. */
export function DocumentDatarooms({
  documentId,
  rooms,
  memberOf,
}: {
  documentId: string;
  rooms: RoomOption[];
  memberOf: RoomRef[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const counts = Object.fromEntries(memberOf.map((r) => [r.id, 1]));

  function remove(room: RoomRef) {
    startTransition(async () => {
      const res = await removeDocumentsFromDataroom(room.id, [documentId]);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Removed from ${room.name}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {memberOf.map((room) => (
        <span
          key={room.id}
          className="group/room inline-flex items-center gap-1 rounded-4xl border bg-card py-0.5 pr-1 pl-2.5 text-sm"
        >
          <a
            href={`/datarooms/${room.id}`}
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <FolderLock className="size-3.5 text-muted-foreground" />
            {room.name}
          </a>
          <button
            type="button"
            disabled={pending}
            onClick={() => remove(room)}
            title={`Remove from ${room.name}`}
            className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/room:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
          >
            <span className="sr-only">Remove from {room.name}</span>
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <DataroomPicker
        documentIds={[documentId]}
        rooms={rooms}
        counts={counts}
        align="start"
      >
        <Button variant="outline" size="sm">
          <Plus className="size-4" /> Add to data room
        </Button>
      </DataroomPicker>
    </div>
  );
}
