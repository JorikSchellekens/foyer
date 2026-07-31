import { FileText, ChevronRight } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { UploadButtons, DropZone } from "@/components/upload/uploader";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";
import { NewFolderDialog, AddNotionDialog } from "./toolbar";
import { DocumentRow, FolderRow, LibCrumbDropLink } from "./rows";
import { SelectionProvider, SelectAllCheckbox } from "./selection";
import type { RoomOption, RoomRef } from "./dataroom-picker";

export const metadata = { title: "Documents" };

/** Column heads recede so the file name reads as the primary axis. */
const HEAD = "h-9 text-xs font-medium text-muted-foreground";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const ctx = await requireTeam();
  const { folder: folderId = null } = await searchParams;

  const extFilter = externalViews(await teamMemberEmails(ctx.team.id));

  const currentFolder = folderId
    ? await db.folder.findFirst({
        where: { id: folderId, teamId: ctx.team.id },
      })
    : null;

  // breadcrumb chain
  const crumbs: { id: string; name: string }[] = [];
  let cursor = currentFolder;
  while (cursor) {
    crumbs.unshift({ id: cursor.id, name: cursor.name });
    cursor = cursor.parentId
      ? await db.folder.findUnique({ where: { id: cursor.parentId } })
      : null;
  }

  const [folders, documents] = await Promise.all([
    db.folder.findMany({
      where: { teamId: ctx.team.id, parentId: folderId },
      include: { _count: { select: { documents: true, children: true } } },
      orderBy: { name: "asc" },
    }),
    db.document.findMany({
      where: { teamId: ctx.team.id, folderId },
      include: {
        currentVersion: true,
        _count: { select: { links: true, views: { where: extFilter } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const isEmpty = folders.length === 0 && documents.length === 0;

  // Data room membership for the rooms this user may see, plus the pick list.
  const { accessibleDataroomIds } = await import("@/lib/permissions");
  const [viewable, editable] = await Promise.all([
    accessibleDataroomIds(ctx),
    accessibleDataroomIds(ctx, "EDIT"),
  ]);
  const editableIds = editable === "all" ? null : new Set(editable);
  const [allRooms, joins] = await Promise.all([
    db.dataroom.findMany({
      where: {
        teamId: ctx.team.id,
        ...(viewable === "all" ? {} : { id: { in: viewable } }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    documents.length
      ? db.dataroomDocument.findMany({
          where: {
            documentId: { in: documents.map((d) => d.id) },
            dataroom: {
              teamId: ctx.team.id,
              ...(viewable === "all" ? {} : { id: { in: viewable } }),
            },
          },
          select: {
            documentId: true,
            dataroom: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const rooms: RoomOption[] = allRooms.map((r) => ({
    ...r,
    canEdit: !editableIds || editableIds.has(r.id),
  }));
  const memberships: Record<string, RoomRef[]> = {};
  for (const join of joins) {
    (memberships[join.documentId] ??= []).push(join.dataroom);
  }
  for (const list of Object.values(memberships))
    list.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Your team's library. Upload, organise, then share with links."
      >
        <NewFolderDialog parentId={folderId} />
        <AddNotionDialog folderId={folderId} />
        <UploadButtons folderId={folderId} />
      </PageHeader>

      <div className="px-4 sm:px-8 py-6">
        {crumbs.length > 0 && (
          <nav
            aria-label="Folder path"
            className="reveal mb-4 flex items-center gap-1 text-sm text-muted-foreground"
          >
            <LibCrumbDropLink
              folderId={null}
              href="/documents"
              className="px-1 hover:text-foreground"
            >
              All documents
            </LibCrumbDropLink>
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                {i === crumbs.length - 1 ? (
                  <span className="px-1 font-medium text-foreground">
                    {c.name}
                  </span>
                ) : (
                  <LibCrumbDropLink
                    folderId={c.id}
                    href={`/documents?folder=${c.id}`}
                    className="px-1 hover:text-foreground"
                  >
                    {c.name}
                  </LibCrumbDropLink>
                )}
              </span>
            ))}
          </nav>
        )}

        {isEmpty ? (
          crumbs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="A quiet library, for now"
              description="Upload your first documents or drop a whole folder. Everything becomes shareable and trackable."
            >
              <UploadButtons folderId={folderId} />
            </EmptyState>
          ) : (
            <DropZone folderId={folderId} />
          )
        ) : (
          <SelectionProvider
            ids={documents.map((d) => d.id)}
            rooms={rooms}
            memberships={memberships}
          >
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={`${HEAD} w-10`}>
                      <SelectAllCheckbox />
                    </TableHead>
                    <TableHead className={HEAD}>Name</TableHead>
                    <TableHead className={`${HEAD} w-28`}>Type</TableHead>
                    <TableHead className={`${HEAD} w-24`}>Size</TableHead>
                    <TableHead className={`${HEAD} w-20`}>Links</TableHead>
                    <TableHead className={`${HEAD} w-20`}>Views</TableHead>
                    <TableHead className={`${HEAD} w-56`}>Data rooms</TableHead>
                    <TableHead className={`${HEAD} w-40 text-right`}>
                      Updated
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folders.map((f, i) => (
                    <FolderRow
                      key={f.id}
                      index={i}
                      folder={{
                        id: f.id,
                        name: f.name,
                        itemCount: f._count.documents + f._count.children,
                      }}
                    />
                  ))}
                  {documents.map((d, i) => (
                    <DocumentRow
                      key={d.id}
                      index={folders.length + i}
                      rooms={rooms}
                      memberOf={memberships[d.id] ?? []}
                      doc={{
                        id: d.id,
                        name: d.name,
                        type: d.type,
                        size: d.currentVersion?.fileSize ?? 0,
                        linkCount: d._count.links,
                        viewCount: d._count.views,
                        updatedAt: d.updatedAt.toISOString(),
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </SelectionProvider>
        )}
      </div>
    </div>
  );
}
