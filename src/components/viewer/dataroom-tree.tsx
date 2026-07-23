"use client";

import { useState } from "react";
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

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const render = (items: ViewerTreeNode[], depth: number) =>
    items.map((node) => {
      const pad = 8 + depth * 14;
      if (node.kind === "folder") {
        const isOpen = !collapsed.has(node.id);
        return (
          <li key={`f-${node.id}`}>
            <button
              type="button"
              onClick={() => toggle(node.id)}
              className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors"
              style={{ paddingLeft: pad, color: palette.text }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = palette.hoverBg)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <ChevronRight
                className="size-3.5 shrink-0 transition-transform"
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
            {isOpen && <ul>{render(node.children, depth + 1)}</ul>}
          </li>
        );
      }
      const active = node.itemId === currentItemId;
      return (
        <li key={`d-${node.itemId}`}>
          <Link
            href={node.href}
            prefetch={false}
            className="flex items-center gap-1.5 rounded-md py-1.5 pr-2 text-[13px] transition-colors"
            style={{
              paddingLeft: pad + 18,
              color: active ? palette.accent : palette.text,
              backgroundColor: active ? palette.activeBg : undefined,
            }}
            onMouseEnter={(e) => {
              if (!active)
                e.currentTarget.style.backgroundColor = palette.hoverBg;
            }}
            onMouseLeave={(e) => {
              if (!active)
                e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-current={active ? "page" : undefined}
          >
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

  return <ul className="space-y-px">{render(nodes, 0)}</ul>;
}
