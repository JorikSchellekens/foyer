import { NextRequest, NextResponse } from "next/server";
import { getTeamContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { zipResponse, type ZipEntry } from "@/lib/zip";

/** Team-side full export of a data room. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dataroom = await db.dataroom.findFirst({
    where: { id, teamId: ctx.team.id },
    include: {
      folders: true,
      documents: { include: { document: { include: { currentVersion: true } } } },
    },
  });
  if (!dataroom)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pathOf = (folderId: string | null): string => {
    const parts: string[] = [];
    let cur = dataroom.folders.find((f) => f.id === folderId);
    while (cur) {
      parts.unshift(cur.name);
      cur = dataroom.folders.find((f) => f.id === cur!.parentId);
    }
    return parts.length ? `${parts.join("/")}/` : "";
  };

  const entries: ZipEntry[] = [];
  for (const item of dataroom.documents) {
    const v = item.document.currentVersion;
    if (v?.fileKey)
      entries.push({ path: `${pathOf(item.folderId)}${v.fileName}`, key: v.fileKey });
  }
  if (entries.length === 0)
    return NextResponse.json({ error: "No files" }, { status: 404 });

  return zipResponse(dataroom.name, entries);
}
