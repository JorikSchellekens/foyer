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
import { Kbd } from "@/components/shell/kbd";
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
      if (e.key !== "Escape") return;
      // Escape belongs to whatever is on top: an open picker or dialog gets to
      // close first, and only a bare Escape drops the selection.
      if (document.querySelector("[data-slot=popover-content], [role=dialog]"))
        return;
      clear();
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

export function RowCheckbox({ id, name }: { id: string; name?: string }) {
  const { selected, toggle } = useSelection();
  const checked = selected.has(id);
  const anySelected = selected.size > 0;
  return (
    <span
      className={cn(
        // The rail is the same marker the nav uses for "active": always in the
        // DOM, scaled on Y so it grows out of the row's centre and costs no
        // layout. -left-2 reaches back over the cell padding to the row edge.
        "relative flex items-center",
        "before:absolute before:-inset-y-1 before:-left-2 before:w-[2px] before:origin-center before:rounded-full before:bg-primary",
        "before:transition-transform before:duration-[var(--dur)] before:ease-[var(--ease-out-quint)]",
        checked ? "before:scale-y-100" : "before:scale-y-0",
        // Selection has to read across the whole row, but the row markup lives
        // in rows.tsx: reach up to it from here for the wash.
        checked && "[tr:has(&)]:bg-accent/70! [tr:hover:has(&)]:bg-accent!",
        // Out of the way until it matters, but once anything is selected every
        // box stays up so the range you are building is visible.
        !checked &&
          !anySelected &&
          "opacity-0 transition-opacity duration-[var(--dur)] ease-[var(--ease-out-soft)] group-hover:opacity-100 group-focus-within:opacity-100"
      )}
    >
      <Checkbox
        checked={checked}
        aria-label={name ? `Select ${name}` : "Select document"}
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
      aria-label={all ? "Deselect all documents" : "Select all documents"}
      onCheckedChange={() => setAll(!all)}
    />
  );
}

/**
 * Bulk actions for the current selection. The bar stays mounted through its
 * exit so leaving is as deliberate as arriving, and it reserves a matching
 * gutter in the flow so it never sits on the last row.
 */
function BulkBar({
  rooms,
  memberships,
}: {
  rooms: RoomOption[];
  memberships: Record<string, RoomRef[]>;
}) {
  const { selected, clear } = useSelection();
  const n = selected.size;
  // The bar outlives the selection by one animation, holding the last count so
  // it can leave as deliberately as it arrived.
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);
  if (n > 0 && (n !== count || !visible)) {
    setCount(n);
    setVisible(true);
  }

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const id of selected)
      for (const room of memberships[id] ?? [])
        acc[room.id] = (acc[room.id] ?? 0) + 1;
    return acc;
  }, [selected, memberships]);

  if (!visible) return null;

  const leaving = n === 0;

  return (
    <>
      {/* Reserve the bar's footprint so the last row can still be read. */}
      <div aria-hidden className="h-20" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div
          // The exit runs on the element itself, so unmount when it finishes.
          onAnimationEnd={() => leaving && setVisible(false)}
          className={cn(
            "flex items-center gap-3 rounded-full border bg-card/95 py-2 pr-2 pl-4 shadow-[var(--shadow-overlay)] backdrop-blur",
            "ease-[var(--ease-out-quint)]",
            leaving
              ? "animate-out fade-out-0 slide-out-to-bottom-3 fill-mode-forwards duration-[var(--dur-fast)]"
              : "pointer-events-auto animate-in fade-in-0 slide-in-from-bottom-3 duration-[var(--dur)]"
          )}
        >
          <p role="status" aria-live="polite" className="text-sm">
            <span className="font-mono">{count}</span>{" "}
            {count === 1 ? "document" : "documents"} selected
          </p>
          {/* Shift-click is invisible until someone tells you. */}
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Kbd>Shift</Kbd>-click for a range
          </span>
          <span aria-hidden className="h-5 w-px bg-border" />
          <DataroomPicker
            documentIds={[...selected]}
            rooms={rooms}
            counts={counts}
            align="end"
          >
            <Button size="sm" className="rounded-full">
              <Plus /> Add to data rooms
            </Button>
          </DataroomPicker>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label="Clear selection"
            title="Clear selection (Esc)"
            onClick={clear}
          >
            <X />
          </Button>
        </div>
      </div>
    </>
  );
}
