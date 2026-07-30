"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { pluralize } from "@/lib/format";
import {
  DataroomPicker,
  type RoomOption,
  type RoomRef,
} from "./dataroom-picker";

type Ctx = {
  ids: string[];
  selected: Set<string>;
  toggle: (id: string, shiftKey: boolean) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
};

const SelectionCtx = createContext<Ctx | null>(null);

function useSelection() {
  const ctx = useContext(SelectionCtx);
  if (!ctx) throw new Error("useSelection outside SelectionProvider");
  return ctx;
}

/**
 * Selection state for the documents table. The table body is rendered by a
 * server component, so the rows share state through this provider rather than
 * lifting it into the page. `ids` is in display order, which is what makes
 * shift-click range selection possible.
 */
export function SelectionProvider({
  ids,
  rooms,
  memberships,
  children,
}: {
  ids: string[];
  rooms: RoomOption[];
  memberships: Record<string, RoomRef[]>;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  // Drop ids that disappeared (deleted, moved, navigated to another folder).
  const key = ids.join(",");
  const [snapshot, setSnapshot] = useState(key);
  if (key !== snapshot) {
    setSnapshot(key);
    if (selected.size) {
      const live = new Set([...selected].filter((id) => ids.includes(id)));
      if (live.size !== selected.size) setSelected(live);
    }
  }

  const clear = useCallback(() => setSelected(new Set()), []);

  const toggle = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (shiftKey && anchor && anchor !== id) {
          const from = ids.indexOf(anchor);
          const to = ids.indexOf(id);
          if (from !== -1 && to !== -1) {
            const [lo, hi] = from < to ? [from, to] : [to, from];
            const on = !prev.has(id);
            for (const rangeId of ids.slice(lo, hi + 1)) {
              if (on) next.add(rangeId);
              else next.delete(rangeId);
            }
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchor(id);
    },
    [anchor, ids]
  );

  const setAll = useCallback(
    (on: boolean) => setSelected(on ? new Set(ids) : new Set()),
    [ids]
  );

  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size, clear]);

  const value = useMemo(
    () => ({ ids, selected, toggle, setAll, clear }),
    [ids, selected, toggle, setAll, clear]
  );

  return (
    <SelectionCtx.Provider value={value}>
      {children}
      <BulkBar rooms={rooms} memberships={memberships} />
    </SelectionCtx.Provider>
  );
}

export function RowCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useSelection();
  const checked = selected.has(id);
  return (
    <span
      // The row itself navigates on click.
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex",
        // Stays out of the way until it matters.
        !checked &&
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      )}
    >
      <Checkbox
        checked={checked}
        aria-label="Select document"
        onClick={(e) => toggle(id, e.shiftKey)}
      />
    </span>
  );
}

export function SelectAllCheckbox() {
  const { ids, selected, setAll } = useSelection();
  if (ids.length === 0) return null;
  const all = selected.size === ids.length;
  return (
    <Checkbox
      checked={all ? true : selected.size > 0 ? "indeterminate" : false}
      aria-label="Select all documents"
      onCheckedChange={() => setAll(!all)}
    />
  );
}

function BulkBar({
  rooms,
  memberships,
}: {
  rooms: RoomOption[];
  memberships: Record<string, RoomRef[]>;
}) {
  const { selected, clear } = useSelection();
  const n = selected.size;

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const id of selected)
      for (const room of memberships[id] ?? [])
        acc[room.id] = (acc[room.id] ?? 0) + 1;
    return acc;
  }, [selected, memberships]);

  if (n === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-card/95 py-2 pr-2 pl-4 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2">
        <span className="text-sm font-medium">
          {pluralize(n, "document")} selected
        </span>
        <DataroomPicker
          documentIds={[...selected]}
          rooms={rooms}
          counts={counts}
          align="end"
        >
          <Button size="sm" className="rounded-full">
            <Plus className="size-4" /> Add to data rooms
          </Button>
        </DataroomPicker>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full"
          onClick={clear}
          title="Clear selection"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
