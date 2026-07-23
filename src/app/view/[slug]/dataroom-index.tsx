import Link from "next/link";
import { Download, ExternalLink, ListOrdered } from "lucide-react";
import type { Branding } from "@prisma/client";
import { itemGrant, type FullLink, type ViewerSession } from "@/lib/access";
import type { GateBrand } from "@/components/viewer/gates";
import { Watermark } from "@/components/viewer/watermark";
import { FoyerMark } from "@/components/brand/logo";
import { PreviewBanner } from "@/components/viewer/preview-banner";
import { formatBytes } from "@/lib/format";
import { db } from "@/lib/db";
import { viewableTree, type NavTreeNode } from "@/lib/dataroom-nav";
import {
  DataroomTree,
  type ViewerTreeNode,
} from "@/components/viewer/dataroom-tree";
import { IndexTracker } from "./index-tracker";
import { QaWidget } from "./qa-widget";

function luminance(hex: string) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

type Entry =
  | {
      kind: "folder";
      number: string;
      name: string;
      depth: number;
      key: string;
    }
  | {
      kind: "document";
      number: string;
      name: string;
      depth: number;
      key: string;
      itemId: string;
      meta: string;
    };

export async function DataroomIndex({
  link,
  slug,
  branding,
  brand,
  session,
  viewId,
  trackToken,
  previewToken = null,
}: {
  link: FullLink;
  slug: string;
  branding: Branding | null;
  brand: GateBrand;
  session: ViewerSession;
  viewId: string;
  trackToken: string;
  currentFolderId: string | null;
  previewToken?: string | null;
}) {
  const dataroom = link.dataroom!;
  const previewQuery = previewToken
    ? `?preview=${encodeURIComponent(previewToken)}`
    : "";

  // flatten visible tree with book-index numbering
  const entries: Entry[] = [];
  const walk = (parentId: string | null, prefix: string, depth: number) => {
    let n = 1;
    for (const folder of dataroom.folders.filter(
      (f) => f.parentId === parentId
    )) {
      const start = entries.length;
      const number = prefix ? `${prefix}.${n}` : `${n}`;
      entries.push({
        kind: "folder",
        number,
        name: folder.name,
        depth,
        key: `f-${folder.id}`,
      });
      walk(folder.id, number, depth + 1);
      // drop empty folders the visitor cannot see into
      if (entries.length === start + 1) entries.pop();
      else n++;
    }
    for (const item of dataroom.documents.filter(
      (d) => d.folderId === parentId
    )) {
      const grant = itemGrant(link, "DATAROOM_DOCUMENT", item.id);
      if (!grant.canView) continue;
      const number = prefix ? `${prefix}.${n}` : `${n}`;
      const version = item.document.currentVersion;
      const metaBits = [
        item.document.type === "NOTION" ? "Notion" : version?.fileName?.split(".").pop()?.toUpperCase(),
        version?.numPages ? `${version.numPages} pp` : null,
        version?.fileSize ? formatBytes(version.fileSize) : null,
      ].filter(Boolean);
      entries.push({
        kind: "document",
        number,
        name: item.document.name,
        depth,
        key: `d-${item.id}`,
        itemId: item.id,
        meta: metaBits.join(" · "),
      });
      n++;
    }
  };
  walk(null, "", 0);

  const useBrandBg = branding?.applyBgToDataroom ?? false;
  const bg = useBrandBg ? brand.backgroundColor : "#fafaf8";
  const dark = luminance(bg) <= 150;
  const text = dark ? "#f2f1ec" : "#16181d";
  const subtle = dark ? "rgba(242,241,236,0.55)" : "rgba(22,24,29,0.55)";
  const hairline = dark ? "rgba(255,255,255,0.14)" : "rgba(22,24,29,0.14)";

  // explorer sidebar: the same grant-filtered content as the index list
  const toViewerTree = (nodes: NavTreeNode[]): ViewerTreeNode[] =>
    nodes.map((n) =>
      n.kind === "folder"
        ? {
            kind: "folder",
            id: n.id,
            name: n.name,
            children: toViewerTree(n.children),
          }
        : {
            kind: "document",
            itemId: n.itemId,
            name: n.name,
            href: `/view/${slug}/d/${n.itemId}${previewQuery}`,
          }
    );
  const tree = toViewerTree(viewableTree(link));

  const questions = link.enableQA
    ? await db.dataroomQuestion.findMany({
        where: { dataroomId: dataroom.id },
        orderBy: { createdAt: "asc" },
        take: 100,
      })
    : [];

  return (
    <main
      className="relative min-h-screen"
      style={{ backgroundColor: bg, color: text }}
    >
      {previewToken && <PreviewBanner />}
      {link.watermark && session.email && <Watermark text={session.email} />}
      {brand.bannerUrl && (
        <div className="h-44 w-full overflow-hidden sm:h-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.bannerUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <IndexTracker
        viewId={viewId}
        trackToken={trackToken}
        preview={!!previewToken}
      >
        <div className="mx-auto max-w-3xl px-6 pb-20 pt-10 lg:max-w-5xl">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logoUrl}
                  alt={brand.teamName}
                  className="h-9 w-auto max-w-32 object-contain"
                />
              ) : (
                <span
                  className="flex size-9 items-center justify-center rounded-md font-mono text-base font-bold text-white"
                  style={{ backgroundColor: brand.brandColor }}
                >
                  {brand.teamName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-sm" style={{ color: subtle }}>
                {brand.teamName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {link.enableIndexFile && (
                <a
                  href={`/api/view/download/${slug}?index=1`}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ borderColor: hairline }}
                >
                  <ListOrdered className="size-3.5" /> Index PDF
                </a>
              )}
              {link.allowDownload && (
                <a
                  href={`/api/view/download/${slug}`}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ borderColor: hairline }}
                >
                  <Download className="size-3.5" /> Download all
                </a>
              )}
              {branding?.ctaUrl && branding.ctaLabel && (
                <a
                  href={branding.ctaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85"
                  style={{ backgroundColor: brand.brandColor }}
                >
                  {branding.ctaLabel} <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </header>

          <div className="mt-12">
            <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">
              {dataroom.name}
            </h1>
            {dataroom.description && (
              <p className="mt-2 max-w-xl text-sm" style={{ color: subtle }}>
                {dataroom.description}
              </p>
            )}
            <div
              className="mt-6 h-px w-24"
              style={{ backgroundColor: brand.brandColor }}
            />
          </div>

          <div className="mt-10 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
            {entries.length > 0 && (
              <aside className="hidden lg:block">
                <div className="sticky top-8">
                  <p
                    className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em]"
                    style={{ color: subtle }}
                  >
                    Contents
                  </p>
                  <DataroomTree
                    nodes={tree}
                    palette={{
                      text,
                      subtle,
                      accent: brand.brandColor,
                      hoverBg: dark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(22,24,29,0.04)",
                      activeBg: dark
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(22,24,29,0.06)",
                    }}
                  />
                </div>
              </aside>
            )}
            <div className="min-w-0">
            {entries.length === 0 ? (
              <p className="text-sm" style={{ color: subtle }}>
                Nothing has been shared with you here yet.
              </p>
            ) : (
              <ol className="space-y-0.5">
                {entries.map((entry) =>
                  entry.kind === "folder" ? (
                    <li
                      key={entry.key}
                      className="flex items-baseline gap-3 pb-1 pt-6 first:pt-0"
                      style={{ paddingLeft: entry.depth * 24 }}
                    >
                      <span
                        className="font-mono text-xs tabular"
                        style={{ color: brand.brandColor }}
                      >
                        {entry.number}
                      </span>
                      <span className="font-display text-xl italic">
                        {entry.name}
                      </span>
                    </li>
                  ) : (
                    <li key={entry.key}>
                      <Link
                        href={`/view/${slug}/d/${entry.itemId}${previewQuery}`}
                        prefetch={false}
                        className="group flex items-baseline rounded-md px-2 py-2 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                        style={{ marginLeft: entry.depth * 24 - 8 }}
                      >
                        <span
                          className="w-10 shrink-0 font-mono text-xs tabular"
                          style={{ color: subtle }}
                        >
                          {entry.number}
                        </span>
                        <span className="min-w-0 truncate text-[15px] font-medium group-hover:underline group-hover:decoration-current/30 group-hover:underline-offset-4">
                          {entry.name}
                        </span>
                        <span className="leader-dots max-sm:hidden" aria-hidden />
                        <span
                          className="shrink-0 font-mono text-[11px] tabular max-sm:hidden"
                          style={{ color: subtle }}
                        >
                          {entry.meta || "view"}
                        </span>
                      </Link>
                    </li>
                  )
                )}
              </ol>
            )}
            </div>
          </div>

          {link.enableQA && (
            <QaWidget
              slug={slug}
              brandColor={brand.brandColor}
              questions={questions.map((q) => ({
                id: q.id,
                body: q.body,
                answer: q.answer,
              }))}
            />
          )}

          <footer
            className="mt-20 flex items-center justify-center gap-1.5 border-t pt-6 text-xs"
            style={{ borderColor: hairline, color: subtle }}
          >
            <FoyerMark className="size-3" />
            Secured by Foyer
          </footer>
        </div>
      </IndexTracker>
    </main>
  );
}
