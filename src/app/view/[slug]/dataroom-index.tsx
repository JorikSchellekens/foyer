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
import {
  interleave,
  viewableTree,
  type NavTreeNode,
} from "@/lib/dataroom-nav";
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

/** Hairline action in the visitor's own colour scheme, quiet until hovered. */
/* max-sm:min-h-10: these two sit alone above the index on a phone, where a
   28px-tall pill is a miss waiting to happen. Width already carries the label. */
const ghostAction =
  "press inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 max-sm:min-h-10 text-xs font-medium outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:bg-current/5 focus-visible:ring-2 focus-visible:ring-current/30";

/** Cap the mount cascade: a 200-file data room should not ripple for 8s. */
const MAX_STAGGER = 12;

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

  // flatten visible tree with book-index numbering; folders and files share
  // one order at each level, so a file may precede a folder
  const entries: Entry[] = [];
  const walk = (parentId: string | null, prefix: string, depth: number) => {
    let n = 1;
    const children = interleave(
      dataroom.folders.filter((f) => f.parentId === parentId),
      dataroom.documents.filter((d) => d.folderId === parentId)
    );
    for (const child of children) {
      const number = prefix ? `${prefix}.${n}` : `${n}`;
      if (child.kind === "folder") {
        const folder = child.item;
        const start = entries.length;
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
      } else {
        const item = child.item;
        const grant = itemGrant(link, "DATAROOM_DOCUMENT", item.id);
        if (!grant.canView) continue;
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
    }
  };
  walk(null, "", 0);
  const docCount = entries.filter((e) => e.kind === "document").length;

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
        <div
          className="h-32 w-full overflow-hidden border-b sm:h-56"
          style={{ borderColor: hairline }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.bannerUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <IndexTracker
        viewId={viewId}
        trackToken={trackToken}
        preview={!!previewToken}
      >
        <div className="mx-auto max-w-3xl px-5 pb-[max(5rem,env(safe-area-inset-bottom))] pt-10 sm:px-6 lg:max-w-5xl">
          <header className="reveal flex flex-wrap items-center justify-between gap-4">
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
                  className={ghostAction}
                  style={{ borderColor: hairline }}
                >
                  <ListOrdered className="size-3.5" /> Index PDF
                </a>
              )}
              {link.allowDownload && (
                <a
                  href={`/api/view/download/${slug}`}
                  className={ghostAction}
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
                  className="press inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 max-sm:min-h-10 text-xs font-medium text-white outline-none transition-opacity duration-[var(--dur-fast)] hover:opacity-85 focus-visible:ring-2 focus-visible:ring-current/40"
                  style={{ backgroundColor: brand.brandColor }}
                >
                  {branding.ctaLabel} <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </header>

          <div className="reveal-up mt-12">
            <h1 className="font-display text-4xl leading-[1.08] tracking-tight sm:text-5xl">
              {dataroom.name}
            </h1>
            {dataroom.description && (
              <p
                className="mt-3 max-w-xl text-sm leading-relaxed"
                style={{ color: subtle }}
              >
                {dataroom.description}
              </p>
            )}
            <div className="mt-6 flex items-center gap-3">
              <div
                className="h-px w-24"
                style={{ backgroundColor: brand.brandColor }}
              />
              {docCount > 0 && (
                <span
                  className="font-mono text-[11px] tabular"
                  style={{ color: subtle }}
                >
                  {docCount} {docCount === 1 ? "document" : "documents"}
                </span>
              )}
            </div>
          </div>

          <div className="mt-10 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
            {entries.length > 0 && (
              <aside className="hidden lg:block">
                <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain pr-1">
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
              <p className="reveal text-sm" style={{ color: subtle }}>
                Nothing has been shared with you here yet.
              </p>
            ) : (
              <ol className="space-y-0.5">
                {entries.map((entry, i) => {
                  const stagger = {
                    "--i": Math.min(i, MAX_STAGGER),
                  } as React.CSSProperties;
                  return entry.kind === "folder" ? (
                    <li
                      key={entry.key}
                      className="stagger-item flex items-baseline gap-3 pb-1.5 pt-7 first:pt-0"
                      style={{ ...stagger, paddingLeft: entry.depth * 24 }}
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
                      <span
                        aria-hidden
                        className="h-px flex-1"
                        style={{ backgroundColor: hairline }}
                      />
                    </li>
                  ) : (
                    <li key={entry.key} className="stagger-item" style={stagger}>
                      <Link
                        href={`/view/${slug}/d/${entry.itemId}${previewQuery}`}
                        prefetch={false}
                        className="group flex items-baseline gap-0 rounded-md px-2 py-2 outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:bg-current/5 focus-visible:bg-current/5 focus-visible:ring-2 focus-visible:ring-current/25 max-sm:flex-wrap"
                        style={{ marginLeft: entry.depth * 24 - 8 }}
                      >
                        <span
                          className="w-10 shrink-0 font-mono text-xs tabular"
                          style={{ color: subtle }}
                        >
                          {entry.number}
                        </span>
                        <span className="underline-grow min-w-0 truncate text-[15px] font-medium group-hover:[background-size:100%_1px] group-focus-visible:[background-size:100%_1px]">
                          {entry.name}
                        </span>
                        <span className="leader-dots max-sm:hidden" aria-hidden />
                        <span
                          className="shrink-0 font-mono text-[11px] tabular max-sm:hidden"
                          style={{ color: subtle }}
                        >
                          {entry.meta || "view"}
                        </span>
                        {/* On a phone the leaders have nowhere to run: the file
                            details drop to their own line instead. */}
                        <span
                          className="w-full pl-10 font-mono text-[11px] tabular sm:hidden"
                          style={{ color: subtle }}
                        >
                          {entry.meta || "view"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
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
