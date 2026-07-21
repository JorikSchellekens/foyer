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
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
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
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search documents, data rooms, visitors…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Actions">
          {ACTIONS.map((a) => (
            <CommandItem
              key={a.href + a.label}
              value={`action ${a.label}`}
              onSelect={() => go(a.href)}
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
                >
                  <Icon className="text-muted-foreground" />
                  <span className="truncate">{i.label}</span>
                  {i.sublabel && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {i.sublabel}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
