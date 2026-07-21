import { Link2 } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { LinksTable } from "@/components/links/links-table";
import {
  getEditorContext,
  toEditorLink,
  buildTree,
  linkUrl,
} from "@/lib/link-helpers";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";

export const metadata = { title: "Links" };

export default async function LinksPage() {
  const ctx = await requireTeam();
  const extFilter = externalViews(await teamMemberEmails(ctx.team.id));
  const [links, editorCtx] = await Promise.all([
    db.link.findMany({
      where: { teamId: ctx.team.id },
      include: {
        domain: true,
        document: true,
        permissions: true,
        recipients: { orderBy: { invitedAt: "desc" } },
        dataroom: {
          include: {
            folders: true,
            documents: { include: { document: true } },
          },
        },
        views: {
          where: extFilter,
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { startedAt: true },
        },
        _count: { select: { views: { where: extFilter } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getEditorContext(ctx.team.id),
  ]);

  const rows = await Promise.all(links.map(async (link) => {
    const url = await linkUrl(link);
    return {
      id: link.id,
      name: link.name,
      url,
      displayUrl: url.replace(/^https?:\/\//, ""),
      targetType: link.target,
      targetId: (link.target === "DATAROOM"
        ? link.dataroomId
        : link.documentId)!,
      targetName:
        link.dataroom?.name ?? link.document?.name ?? "Untitled",
      views: link._count.views,
      lastViewed: link.views[0]?.startedAt.toISOString() ?? null,
      isArchived: link.isArchived,
      editor: toEditorLink(link),
      tree: link.dataroom
        ? buildTree(link.dataroom.folders, link.dataroom.documents)
        : [],
      recipients: link.recipients.map((r) => ({
        id: r.id,
        email: r.email,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        invitedAt: r.invitedAt.toISOString(),
      })),
    };
  }));

  return (
    <div>
      <PageHeader
        title="Links"
        description="Every way your documents and data rooms are shared, in one place."
      />
      <div className="px-4 sm:px-8 py-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="No links yet"
            description="Create a link from any document or data room to start sharing, and every visit will be tracked here."
          />
        ) : (
          <LinksTable rows={rows} ctx={editorCtx} />
        )}
      </div>
    </div>
  );
}
