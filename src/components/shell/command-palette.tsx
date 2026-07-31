"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  FolderLock,
  User,
  Upload,
  Plus,
  Link2,
  CornerDownLeft,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/shell/kbd";
import { cn } from "@/lib/utils";
import { loadSearchIndex, type SearchItem } from "@/app/(app)/command-actions";

const KIND_ICON = {
  document: FileText,
  dataroom: FolderLock,
  visitor: User,
} as const;

const KIND_GROUP = {
  document: "Documents",
  dataroom: "Data rooms",
  visitor: "Visitors",
} as const;

const ACTIONS: { label: string; href: string; icon: typeof Plus }[] = [
  { label: "Upload documents", href: "/documents", icon: Upload },
  { label: "New data room", href: "/datarooms", icon: Plus },
  { label: "All links", href: "/links", icon: Link2 },
];

/**
 * Result row. The selected state carries the same leading rail as a sidebar
 * item, so "where am I" reads identically in both places. cmdk keeps the
 * selected row scrolled into view itself.
 */
const ROW = cn(
  "relative gap-2.5 py-2 pl-3 pr-2",
  "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)]",
  "before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:origin-center",
  "before:scale-y-0 before:rounded-full before:bg-primary",
  "before:transition-transform before:duration-[var(--dur-fast)] before:ease-[var(--ease-out-quint)]",
  "data-selected:bg-accent data-selected:text-accent-foreground",
  "data-selected:before:scale-y-100"
);

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SearchItem[] | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("foyer:open-command", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("foyer:open-command", onOpen);
    };
  }, []);

  // Load the index the first time the palette opens; refresh on each open.
  useEffect(() => {
    if (open) loadSearchIndex().then(setItems);
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const groups: SearchItem["kind"][] = ["document", "dataroom", "visitor"];

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      className="top-[15vh] sm:max-w-xl"
    >
      <Command loop>
        <CommandInput placeholder="Search documents, data rooms, visitors…" />
        <CommandList className="max-h-[min(60vh,24rem)] scroll-py-2">
          <CommandEmpty>
            <span className="block text-sm">No matches</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Try a document name, a data room, or a visitor email.
            </span>
          </CommandEmpty>
          <CommandGroup heading="Actions">
            {ACTIONS.map((a) => (
              <CommandItem
                key={a.href + a.label}
                value={`action ${a.label}`}
                onSelect={() => go(a.href)}
                className={ROW}
              >
                <a.icon className="text-muted-foreground" />
                {a.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {groups.map((kind) => {
            const rows = (items ?? []).filter((i) => i.kind === kind);
            if (rows.length === 0) return null;
            const Icon = KIND_ICON[kind];
            return (
              <CommandGroup key={kind} heading={KIND_GROUP[kind]}>
                {rows.map((i) => (
                  <CommandItem
                    key={i.id}
                    value={`${i.label} ${i.sublabel ?? ""} ${i.id}`}
                    onSelect={() => go(i.href)}
                    className={ROW}
                  >
                    <Icon className="text-muted-foreground" />
                    <span className="truncate">{i.label}</span>
                    {i.sublabel && (
                      <CommandShortcut className="shrink-0 tracking-normal text-muted-foreground">
                        {i.sublabel}
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
        <div className="-mx-1 -mb-1 mt-1 flex items-center justify-between gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span className="ml-0.5">move</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>
                <CornerDownLeft className="size-2.5" />
              </Kbd>
              <span className="ml-0.5">open</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd className="px-1.5">esc</Kbd>
              <span className="ml-0.5">close</span>
            </span>
          </span>
          {items === null && (
            <span className="animate-[reveal_var(--dur-reveal)_var(--ease-out-quint)_both]">
              Loading library…
            </span>
          )}
        </div>
      </Command>
    </CommandDialog>
  );
}
