import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  evaluateAccess,
  getViewerSession,
  itemGrant,
  resolveLink,
  type FullLink,
} from "@/lib/access";
import { zipResponse, type ZipEntry } from "@/lib/zip";
import { generateIndexPdf, type IndexNode } from "@/lib/dataroom-index";

function buildNodes(link: FullLink, forIndex: boolean): {
  entries: ZipEntry[];
  nodes: IndexNode[];
} {
  const dataroom = link.dataroom!;
  const entries: ZipEntry[] = [];

  const folderChildren = (parentId: string | null, path: string): IndexNode[] => {
    const out: IndexNode[] = [];
    for (const folder of dataroom.folders.filter((f) => f.parentId === parentId)) {
      const grant = itemGrant(link, "DATAROOM_FOLDER", folder.id);
      // folders show when they contain anything visible; recurse regardless
      const children = folderChildren(folder.id, `${path}${folder.name}/`);
      if (children.length > 0 || grant.canView) {
        out.push({ kind: "folder", name: folder.name, children });
      }
    }
    for (const item of dataroom.documents.filter((d) => d.folderId === parentId)) {
      const grant = itemGrant(link, "DATAROOM_DOCUMENT", item.id);
      if (!grant.canView) continue;
      if (!forIndex && !grant.canDownload) continue;
      const version = item.document.currentVersion;
      if (version?.fileKey) {
        entries.push({
          path: `${path}${version.fileName}`,
          key: version.fileKey,
        });
      }
      out.push({
        kind: "document",
        name: item.document.name,
        fileName: version?.fileName,
      });
    }
    return out;
  };

  const nodes = folderChildren(null, "");
  return { entries, nodes };
}

/**
 * ?index=1 returns the generated PDF table of contents;
 * otherwise streams a zip of everything the session may download.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const host = req.headers.get("host") ?? "";
  const link = await resolveLink(host, slug);
  if (!link || link.target !== "DATAROOM" || !link.dataroom)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getViewerSession(link.id);
  const access = evaluateAccess(link, session);
  if (access.kind !== "granted")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wantsIndex = req.nextUrl.searchParams.get("index") === "1";

  if (wantsIndex) {
    if (!link.enableIndexFile)
      return NextResponse.json({ error: "Not enabled" }, { status: 403 });
    const { nodes } = buildNodes(link, true);
    const bytes = await generateIndexPdf(
      link.dataroom.name,
      link.team.name,
      nodes
    );
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${encodeURIComponent(
          link.dataroom.name
        )} - Index.pdf"`,
      },
    });
  }

  if (!link.allowDownload)
    return NextResponse.json(
      { error: "Downloads are disabled for this link" },
      { status: 403 }
    );

  const { entries } = buildNodes(link, false);
  if (entries.length === 0)
    return NextResponse.json(
      { error: "Nothing downloadable" },
      { status: 404 }
    );

  if (session.viewId) {
    await db.view
      .update({
        where: { id: session.viewId },
        data: { downloadedAt: new Date() },
      })
      .catch(() => {});
  }

  return zipResponse(link.dataroom.name, entries);
}
