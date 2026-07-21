import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Stat } from "@/components/shell/stat";
import { EmptyState } from "@/components/shell/empty-state";
import { LinkEditor } from "@/components/links/link-editor";
import { LinksTable } from "@/components/links/links-table";
import { ViewsTable } from "@/components/analytics/views-table";
import { VisitsChart } from "@/components/analytics/visits-chart";
import { BrandingForm } from "@/components/branding/branding-form";
import {
  getEditorContext,
  toEditorLink,
  buildTree,
  linkUrl,
} from "@/lib/link-helpers";
import { formatDuration } from "@/lib/format";
import { DataroomMenu } from "./dataroom-menu";
import {
  AddFromLibraryDialog,
  DataroomUploadButtons,
  DrDocumentRow,
  DrFolderRow,
  NewDrFolderButton,
} from "./contents-client";
import { AccessTab, type MemberAccess } from "./access-client";
import { QaTab } from "./qa-client";
import { FolderLock } from "lucide-react";

const TABS = [
  { key: "contents", label: "Contents" },
  { key: "links", label: "Access links" },
  { key: "access", label: "Access" },
  { key: "qa", label: "Q&A" },
  { key: "branding", label: "Branding" },
  { key: "analytics", label: "Analytics" },
] as const;

export default async function DataroomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; folder?: string }>;
}) {
  const ctx = await requireTeam();
  const { id } = await params;
  const { tab = "contents", folder: folderId = null } = await searchParams;

  const { canAccessDataroom } = await import("@/lib/permissions");
  if (!(await canAccessDataroom(ctx, id, "VIEW"))) notFound();

  const dataroom = await db.dataroom.findFirst({
    where: { id, teamId: ctx.team.id },
    include: {
      folders: { orderBy: [{ orderIndex: "asc" }, { name: "asc" }] },
      documents: {
        include: { document: { include: { currentVersion: true } } },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      },
      branding: true,
      questions: { orderBy: { createdAt: "desc" } },
      links: {
        include: {
          domain: true,
          permissions: true,
          recipients: true,
          views: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { startedAt: true },
          },
          _count: { select: { views: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      views: {
        orderBy: { startedAt: "desc" },
        take: 100,
        include: {
          viewer: true,
          link: { include: { domain: true } },
          document: true,
        },
      },
    },
  });
  if (!dataroom) notFound();

  const editorCtx = await getEditorContext(ctx.team.id);
  const tree = buildTree(dataroom.folders, dataroom.documents);

  const canManageAccess = ctx.role === "OWNER" || ctx.role === "ADMIN";
  const teamMembers = await db.teamMember.findMany({
    where: { teamId: ctx.team.id },
    include: {
      user: true,
      permissions: { where: { resourceType: "DATAROOM" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const memberAccess: MemberAccess[] = teamMembers.map((m) => ({
    id: m.id,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
    level:
      m.permissions.find((p) => p.resourceId === dataroom.id)?.level ?? "NONE",
    restricted: m.permissions.length > 0,
  }));

  const createLinkButton = (
    <LinkEditor
      mode="create"
      target={{ type: "DATAROOM", id: dataroom.id, name: dataroom.name }}
      domains={editorCtx.domains}
      agreements={editorCtx.agreements}
      presets={editorCtx.presets}
      previewPresets={editorCtx.previewPresets}
      tree={tree}
      appHost={editorCtx.appHost}
      trigger={
        <Button>
          <Plus className="size-4" /> Create link
        </Button>
      }
    />
  );

  return (
    <div>
      <div className="border-b px-4 sm:px-8 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link href="/datarooms" className="hover:text-foreground">
                Data rooms
              </Link>
              <ChevronRight className="size-3" />
              <span>{dataroom.name}</span>
            </div>
            <h1 className="mt-1 font-display text-3xl tracking-tight">
              {dataroom.name}
            </h1>
            {dataroom.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {dataroom.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {createLinkButton}
            <DataroomMenu
              dataroom={{
                id: dataroom.id,
                name: dataroom.name,
                description: dataroom.description,
              }}
            />
          </div>
        </div>

        <nav className="mt-5 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/datarooms/${dataroom.id}?tab=${t.key}`}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                tab === t.key
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.key === "qa" &&
                dataroom.questions.filter((q) => !q.answer).length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    {dataroom.questions.filter((q) => !q.answer).length}
                  </span>
                )}
            </Link>
          ))}
        </nav>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {tab === "contents" && (
          <ContentsTab
            dataroom={dataroom}
            folderId={folderId}
            teamId={ctx.team.id}
          />
        )}

        {tab === "links" && (
          <div className="space-y-4">
            {dataroom.links.length === 0 ? (
              <EmptyState
                icon={FolderLock}
                title="Not shared yet"
                description="Create an access link to open this data room to the world, or to exactly the people you choose."
              >
                {createLinkButton}
              </EmptyState>
            ) : (
              <LinksTable
                showTarget={false}
                ctx={editorCtx}
                rows={await Promise.all(dataroom.links.map(async (link) => {
                  const url = await linkUrl(link);
                  return {
                    id: link.id,
                    name: link.name,
                    url,
                    displayUrl: url.replace(/^https?:\/\//, ""),
                    targetType: "DATAROOM" as const,
                    targetId: dataroom.id,
                    targetName: dataroom.name,
                    views: link._count.views,
                    lastViewed: link.views[0]?.startedAt.toISOString() ?? null,
                    isArchived: link.isArchived,
                    editor: toEditorLink(link),
                    tree,
                    recipients: link.recipients.map((r) => ({
                      id: r.id,
                      email: r.email,
                      expiresAt: r.expiresAt?.toISOString() ?? null,
                      invitedAt: r.invitedAt.toISOString(),
                    })),
                  };
                }))}
              />
            )}
          </div>
        )}

        {tab === "access" && (
          <AccessTab
            dataroomId={dataroom.id}
            members={memberAccess}
            canManage={canManageAccess}
          />
        )}

        {tab === "qa" && (
          <QaTab
            dataroomId={dataroom.id}
            questions={dataroom.questions.map((q) => ({
              id: q.id,
              body: q.body,
              viewerEmail: q.viewerEmail,
              answer: q.answer,
              answeredBy: q.answeredBy,
              answeredAt: q.answeredAt?.toISOString() ?? null,
              createdAt: q.createdAt.toISOString(),
            }))}
          />
        )}

        {tab === "branding" && (
          <div className="space-y-4">
            <p className="max-w-xl text-sm text-muted-foreground">
              Branding for this data room only. Anything unset falls back to
              your workspace branding in Settings.
            </p>
            <BrandingForm
              dataroomId={dataroom.id}
              initial={
                dataroom.branding
                  ? {
                      logoKey: dataroom.branding.logoKey,
                      bannerKey: dataroom.branding.bannerKey,
                      brandColor: dataroom.branding.brandColor,
                      backgroundColor: dataroom.branding.backgroundColor,
                      applyBgToDataroom: dataroom.branding.applyBgToDataroom,
                      welcomeMessage: dataroom.branding.welcomeMessage,
                      ctaLabel: dataroom.branding.ctaLabel,
                      ctaUrl: dataroom.branding.ctaUrl,
                      metaTitle: dataroom.branding.metaTitle,
                      metaDescription: dataroom.branding.metaDescription,
                      metaImageKey: dataroom.branding.metaImageKey,
                    }
                  : null
              }
            />
          </div>
        )}

        {tab === "analytics" && <AnalyticsTab dataroom={dataroom} />}
      </div>
    </div>
  );
}

function ContentsTab({
  dataroom,
  folderId,
  teamId,
}: {
  dataroom: {
    id: string;
    folders: { id: string; name: string; parentId: string | null }[];
    documents: {
      id: string;
      folderId: string | null;
      createdAt: Date;
      document: {
        id: string;
        name: string;
        type: import("@prisma/client").DocumentType;
        currentVersion: { fileSize: number } | null;
      };
    }[];
  };
  folderId: string | null;
  teamId: string;
}) {
  return <ContentsTabInner dataroom={dataroom} folderId={folderId} teamId={teamId} />;
}

async function ContentsTabInner({
  dataroom,
  folderId,
  teamId,
}: {
  dataroom: {
    id: string;
    folders: { id: string; name: string; parentId: string | null }[];
    documents: {
      id: string;
      folderId: string | null;
      createdAt: Date;
      document: {
        id: string;
        name: string;
        type: import("@prisma/client").DocumentType;
        currentVersion: { fileSize: number } | null;
      };
    }[];
  };
  folderId: string | null;
  teamId: string;
}) {
  // library documents (for add-from-library), with folder path labels
  const [libraryDocs, libraryFolders] = await Promise.all([
    db.document.findMany({
      where: { teamId },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    db.folder.findMany({ where: { teamId } }),
  ]);
  const pathOf = (fid: string | null): string => {
    const parts: string[] = [];
    let cur = libraryFolders.find((f) => f.id === fid);
    while (cur) {
      parts.unshift(cur.name);
      cur = libraryFolders.find((f) => f.id === cur!.parentId);
    }
    return parts.join(" / ");
  };

  const crumbs: { id: string; name: string }[] = [];
  let cursor = dataroom.folders.find((f) => f.id === folderId);
  while (cursor) {
    crumbs.unshift({ id: cursor.id, name: cursor.name });
    cursor = dataroom.folders.find((f) => f.id === cursor!.parentId);
  }

  const foldersHere = dataroom.folders.filter((f) => f.parentId === folderId);
  const docsHere = dataroom.documents.filter((d) => d.folderId === folderId);
  const countIn = (fid: string): number =>
    dataroom.folders.filter((f) => f.parentId === fid).length +
    dataroom.documents.filter((d) => d.folderId === fid).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link
            href={`/datarooms/${dataroom.id}`}
            className="hover:text-foreground"
          >
          Root
          </Link>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="size-3.5" />
              {i === crumbs.length - 1 ? (
                <span className="text-foreground">{c.name}</span>
              ) : (
                <Link
                  href={`/datarooms/${dataroom.id}?folder=${c.id}`}
                  className="hover:text-foreground"
                >
                  {c.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <NewDrFolderButton dataroomId={dataroom.id} parentId={folderId} />
          <AddFromLibraryDialog
            dataroomId={dataroom.id}
            folderId={folderId}
            library={libraryDocs.map((d) => ({
              id: d.id,
              name: d.name,
              type: d.type,
              path: pathOf(d.folderId),
            }))}
          />
          <DataroomUploadButtons dataroomId={dataroom.id} folderId={folderId} />
        </div>
      </div>

      {foldersHere.length === 0 && docsHere.length === 0 ? (
        <EmptyState
          icon={FolderLock}
          title="Nothing here yet"
          description="Upload files, bring in documents from your library, or create folders to build the index your visitors will see."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Size</TableHead>
                <TableHead className="w-36">Added</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {foldersHere.map((f) => (
                <DrFolderRow
                  key={f.id}
                  dataroomId={dataroom.id}
                  folder={{ id: f.id, name: f.name, itemCount: countIn(f.id) }}
                />
              ))}
              {docsHere.map((d) => (
                <DrDocumentRow
                  key={d.id}
                  dataroomId={dataroom.id}
                  item={{
                    id: d.id,
                    documentId: d.document.id,
                    name: d.document.name,
                    type: d.document.type,
                    size: d.document.currentVersion?.fileSize ?? 0,
                    addedAt: d.createdAt.toISOString(),
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

async function AnalyticsTab({
  dataroom,
}: {
  dataroom: {
    views: (import("@prisma/client").View & {
      viewer: import("@prisma/client").Viewer | null;
      link: import("@prisma/client").Link & {
        domain: import("@prisma/client").Domain | null;
      };
      document: import("@prisma/client").Document | null;
    })[];
  };
}) {
  const views = dataroom.views;
  const uniqueEmails = new Set(
    views.map((v) => v.viewerEmail).filter(Boolean)
  );
  const totalTime = views.reduce((s, v) => s + v.totalDuration, 0);

  const byDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const v of views) {
    const key = v.startedAt.toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Visits" value={views.length} />
        <Stat label="Unique visitors" value={uniqueEmails.size} />
        <Stat
          label="Total time"
          value={formatDuration(totalTime)}
        />
        <Stat
          label="Avg visit"
          value={formatDuration(views.length ? totalTime / views.length : 0)}
        />
      </div>
      <div className="rounded-lg border bg-card p-5">
        <h3 className="mb-3 text-sm font-medium">Visits, last 30 days</h3>
        <VisitsChart
          data={[...byDay.entries()].map(([date, visits]) => ({
            date,
            visits,
          }))}
        />
      </div>
      <ViewsTable
        showItem
        rows={await Promise.all(
          views.map(async (v) => ({
            id: v.id,
            viewerId: v.viewerId,
            email: v.viewerEmail,
            verified: v.verified,
            linkName: v.link.name,
            linkUrl: await linkUrl(v.link),
            itemName: v.document?.name ?? "Data room index",
            itemHref: v.document ? `/documents/${v.document.id}` : null,
            duration: v.totalDuration,
            completedPct: v.completedPct || null,
            device: v.device,
            browser: v.browser,
            country: v.country,
            city: v.city,
            startedAt: v.startedAt.toISOString(),
            downloaded: !!v.downloadedAt,
          }))
        )}
      />
    </div>
  );
}
