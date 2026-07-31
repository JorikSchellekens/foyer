"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Folder } from "lucide-react";

/** Serializable, grant-filtered tree with hrefs resolved server-side. */
export type ViewerTreeNode =
  | { kind: "folder"; id: string; name: string; children: ViewerTreeNode[] }
  | { kind: "document"; itemId: string; name: string; href: string };

export type TreePalette = {
  text: string;
  subtle: string;
  accent: string;
  hoverBg: string;
  activeBg: string;
};

/**
 * The explorer tree visitors navigate a data room with. Everything starts
 * expanded (an index should hide nothing); folders collapse on demand.
 * Colors come in as a palette so the same tree works on the branded index
 * page and inside the dark document chrome.
 */
export function DataroomTree({
  nodes,
  currentItemId = null,
  palette,
}: {
  nodes: ViewerTreeNode[];
  currentItemId?: string | null;
  palette: TreePalette;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const uid = useId();

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rowClass =
    "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] outline-none transition-[background-color,color] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)] focus-visible:ring-2 focus-visible:ring-[var(--row-ring)]";

  const render = (items: ViewerTreeNode[], depth: number) =>
    items.map((node) => {
      const pad = 8 + depth * 14;
      if (node.kind === "folder") {
        const isOpen = !collapsed.has(node.id);
        const panelId = `${uid}-${node.id}`;
        return (
          <li key={`f-${node.id}`}>
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={rowClass}
              style={{ paddingLeft: pad, color: palette.text }}
            >
              <ChevronRight
                className="size-3.5 shrink-0 transition-transform duration-[var(--dur)] ease-[var(--ease-out-quint)]"
                style={{
                  color: palette.subtle,
                  transform: isOpen ? "rotate(90deg)" : undefined,
                }}
              />
              <Folder
                className="size-3.5 shrink-0"
                strokeWidth={1.5}
                style={{ color: palette.subtle }}
              />
              <span className="min-w-0 truncate font-medium">{node.name}</span>
            </button>
            {/*
             * grid-template-rows 1fr -> 0fr animates the children's own height
             * without measuring it, so a folder unfolds instead of snapping.
             * Kept mounted (inert when closed) so the transition has something
             * to animate and collapsed rows stay out of the tab order.
             */}
            <div
              id={panelId}
              inert={!isOpen}
              className="grid transition-[grid-template-rows,opacity] duration-[var(--dur)] ease-[var(--ease-out-quint)]"
              style={{
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                opacity: isOpen ? 1 : 0,
              }}
            >
              <ul className="min-h-0 overflow-hidden">
                {render(node.children, depth + 1)}
              </ul>
            </div>
          </li>
        );
      }
      const active = node.itemId === currentItemId;
      return (
        <li key={`d-${node.itemId}`}>
          <Link
            href={node.href}
            prefetch={false}
            className={`${rowClass} relative`}
            style={{
              paddingLeft: pad + 18,
              color: active ? palette.accent : palette.text,
              backgroundColor: active ? palette.activeBg : undefined,
              fontWeight: active ? 500 : undefined,
            }}
            aria-current={active ? "page" : undefined}
          >
            {/* The file being read gets a spine on the leading edge. */}
            {active && (
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 w-[2px] rounded-full"
                style={{ backgroundColor: palette.accent }}
              />
            )}
            <FileText
              className="size-3.5 shrink-0"
              strokeWidth={1.5}
              style={{ color: active ? palette.accent : palette.subtle }}
            />
            <span className="min-w-0 truncate">{node.name}</span>
          </Link>
        </li>
      );
    });

  return (
    <ul
      className="space-y-px"
      style={
        {
          "--row-hover": palette.hoverBg,
          "--row-ring": `color-mix(in oklab, ${palette.accent} 45%, transparent)`,
        } as React.CSSProperties
      }
    >
      {render(nodes, 0)}
    </ul>
  );
}
