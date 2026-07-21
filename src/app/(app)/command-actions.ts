"use server";

import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleDataroomIds } from "@/lib/permissions";

export type SearchItem = {
  id: string;
  label: string;
  sublabel?: string;
  kind: "document" | "dataroom" | "visitor";
  href: string;
};

/** Everything the command palette can jump to, scoped to the current team. */
export async function loadSearchIndex(): Promise<SearchItem[]> {
  const ctx = await requireTeam();
  const allowed = await accessibleDataroomIds(ctx);

  const [documents, datarooms, viewers] = await Promise.all([
    db.document.findMany({
      where: { teamId: ctx.team.id },
      select: { id: true, name: true, type: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.dataroom.findMany({
      where: {
        teamId: ctx.team.id,
        ...(allowed === "all" ? {} : { id: { in: allowed } }),
      },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.viewer.findMany({
      where: { teamId: ctx.team.id },
      select: { id: true, email: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return [
    ...documents.map((d): SearchItem => ({
      id: d.id,
      label: d.name,
      sublabel: d.type.toLowerCase(),
      kind: "document",
      href: `/documents/${d.id}`,
    })),
    ...datarooms.map((r): SearchItem => ({
      id: r.id,
      label: r.name,
      kind: "dataroom",
      href: `/datarooms/${r.id}`,
    })),
    ...viewers.map((v): SearchItem => ({
      id: v.id,
      label: v.email,
      kind: "visitor",
      href: `/visitors/${v.id}`,
    })),
  ];
}
