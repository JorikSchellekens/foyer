import "server-only";

import { PapermarkClient, type PmLink } from "./client";
import {
  fileNameFor,
  isExternalDocument,
  mapLinkSettings,
  planLinkUrl,
  type Caveat,
  type MappedLinkSettings,
} from "./mapping";

/**
 * Reads a Papermark account into a plan: a complete, self-contained inventory
 * of what exists there and what importing it would produce here.
 *
 * The plan is snapshotted onto the Import row before anything is written, so
 * the screen the user approves is provably the same data the run executes
 * from. It is also the only place the source account is read in bulk - the run
 * itself only re-fetches file bytes.
 */

export type PlannedFolder = {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  documentCount: number;
};

export type PlannedDocument = {
  id: string;
  name: string;
  fileName: string;
  folderId: string | null;
  type: string | null;
  contentType: string | null;
  numPages: number | null;
  /** Notion/link documents carry a URL instead of bytes; nothing to download. */
  external: boolean;
  externalUrl: string | null;
  sizeBytes: number | null;
};

export type PlannedDataroomFolder = {
  id: string;
  name: string;
  parentId: string | null;
  orderIndex: number;
};

export type PlannedDataroomDocument = {
  /**
   * Papermark's DataroomDocument join id. Kept because link permissions
   * reference dataroom items by an id that may be either this or the
   * underlying document id, and we have to resolve both.
   */
  id: string;
  documentId: string;
  name: string;
  folderId: string | null;
  orderIndex: number;
};

export type PlannedDataroom = {
  id: string;
  name: string;
  description: string | null;
  folders: PlannedDataroomFolder[];
  documents: PlannedDataroomDocument[];
};

export type PlannedLink = {
  id: string;
  name: string;
  targetType: "document" | "dataroom";
  documentId: string | null;
  dataroomId: string | null;
  currentUrl: string;
  domain: string | null;
  slug: string;
  exactPreservable: boolean;
  audienceType: PmLink["audience_type"];
  groupId: string | null;
  isArchivedTarget: boolean;
  /**
   * Foyer settings derived from the source link at scan time. Resolved once,
   * here, so the run writes exactly what the review screen displayed - the
   * mapping rules never get a second, drifting implementation.
   */
  settings: MappedLinkSettings;
  caveats: Caveat[];
  /** Per-item grants, present only for partial-access dataroom links. */
  permissions: {
    itemId: string;
    itemType: "dataroom_document" | "dataroom_folder";
    canView: boolean;
    canDownload: boolean;
  }[];
};

export type PlannedDomain = {
  domain: string;
  linkCount: number;
};

export type PlannedVisitor = {
  id: string;
  email: string;
  verified: boolean;
  totalViews: number;
  lastViewedAt: string | null;
};

export type ImportPlan = {
  scannedAt: string;
  folders: PlannedFolder[];
  documents: PlannedDocument[];
  datarooms: PlannedDataroom[];
  links: PlannedLink[];
  domains: PlannedDomain[];
  visitors: PlannedVisitor[];
  /** Documents whose bytes must be fetched (excludes notion/link docs). */
  fileCount: number;
  totalBytes: number;
};

export type ScanProgress = (stage: string, detail?: string) => void;

export async function scanPapermark(
  client: PapermarkClient,
  onProgress: ScanProgress = () => {}
): Promise<ImportPlan> {
  onProgress("Reading library folders");
  const pmFolders = await client.listFolders();

  onProgress("Reading documents");
  const pmDocuments = await client.listDocuments();

  // Sizes live on versions, one request per document. For large accounts that
  // is the most expensive part of the scan, so only ask for documents that
  // actually have bytes, and tolerate individual failures - a missing size
  // costs us a progress estimate, not the import.
  const fileDocs = pmDocuments.filter((d) => !isExternalDocument(d.type));
  const sizes = new Map<string, number>();
  let i = 0;
  for (const doc of fileDocs) {
    i++;
    onProgress("Measuring documents", `${i}/${fileDocs.length}`);
    try {
      const versions = await client.listDocumentVersions(doc.id);
      const primary =
        versions.find((v) => v.is_primary) ??
        versions.sort((a, b) => b.version_number - a.version_number)[0];
      if (primary?.file_size) sizes.set(doc.id, primary.file_size);
    } catch {
      /* size is advisory only */
    }
  }

  onProgress("Reading datarooms");
  const pmDatarooms = await client.listDatarooms();
  const datarooms: PlannedDataroom[] = [];
  for (const dr of pmDatarooms) {
    onProgress("Reading datarooms", dr.name);
    const [folders, docs] = await Promise.all([
      client.listDataroomFolders(dr.id),
      client.listDataroomDocuments(dr.id),
    ]);
    datarooms.push({
      id: dr.id,
      name: dr.name,
      description: dr.description,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parent_id,
        orderIndex: f.order_index ?? 0,
      })),
      documents: docs.map((d) => ({
        id: d.id,
        documentId: d.document_id,
        name: d.document_name,
        folderId: d.folder_id,
        orderIndex: d.order_index ?? 0,
      })),
    });
  }

  onProgress("Reading links");
  const pmLinks = await client.listLinks();

  // Only dataroom links can carry per-item grants; asking for the rest would
  // waste a third of the rate-limit budget on guaranteed-empty responses.
  const links: PlannedLink[] = [];
  const knownDocIds = new Set(pmDocuments.map((d) => d.id));
  const knownDataroomIds = new Set(pmDatarooms.map((d) => d.id));

  for (const link of pmLinks) {
    const { settings, caveats } = mapLinkSettings(link);
    const urlPlan = planLinkUrl(link);

    let permissions: PlannedLink["permissions"] = [];
    if (link.target_type === "dataroom") {
      onProgress("Reading link permissions", link.name ?? link.id);
      try {
        const perms = await client.getLinkPermissions(link.id);
        permissions = perms.map((p) => ({
          itemId: p.item_id,
          itemType: p.item_type,
          canView: p.can_view,
          canDownload: p.can_download,
        }));
      } catch {
        caveats.push({
          severity: "lossy",
          code: "permissions_unreadable",
          message:
            "Per-item permissions for this link could not be read; it will be imported with access to the whole dataroom. Review before sharing.",
        });
      }
    }

    // A link pointing at something outside our inventory (deleted, or in a
    // dataroom the token cannot see) cannot be rebuilt.
    const targetMissing =
      (link.target_type === "document" &&
        (!link.document_id || !knownDocIds.has(link.document_id))) ||
      (link.target_type === "dataroom" &&
        (!link.dataroom_id || !knownDataroomIds.has(link.dataroom_id)));

    if (targetMissing) {
      caveats.push({
        severity: "blocking",
        code: "target_missing",
        message:
          "The document or dataroom this link points at is not visible to this API token, so the link cannot be recreated.",
      });
    }

    if (link.audience_type === "group") {
      caveats.push({
        severity: "lossy",
        code: "group_link",
        message:
          "This is a dataroom group link. Foyer has no viewer groups, so the group's members and domains are imported as this link's access list instead.",
      });
    }

    links.push({
      id: link.id,
      name: link.name ?? "Untitled link",
      targetType: link.target_type,
      documentId: link.document_id,
      dataroomId: link.dataroom_id,
      currentUrl: urlPlan.currentUrl,
      domain: urlPlan.domain,
      slug: urlPlan.slug,
      exactPreservable: urlPlan.exactPreservable,
      audienceType: link.audience_type,
      groupId: link.group_id,
      isArchivedTarget: targetMissing,
      settings,
      caveats,
      permissions,
    });
  }

  // Papermark exposes no domain endpoint, so the only way to learn which
  // custom domains a team uses is to collect them off the links themselves.
  const domainCounts = new Map<string, number>();
  for (const l of links) {
    if (l.domain) domainCounts.set(l.domain, (domainCounts.get(l.domain) ?? 0) + 1);
  }

  onProgress("Reading visitors");
  let visitors: PlannedVisitor[] = [];
  try {
    visitors = (await client.listVisitors()).map((v) => ({
      id: v.id,
      email: v.email,
      verified: v.verified,
      totalViews: v.total_views,
      lastViewedAt: v.last_viewed_at,
    }));
  } catch {
    // visitors.read is an optional scope; its absence must not fail a scan.
  }

  const documents: PlannedDocument[] = pmDocuments.map((d) => ({
    id: d.id,
    name: d.name,
    fileName: fileNameFor(d.name, d.content_type, d.type),
    folderId: d.folder_id,
    type: d.type,
    contentType: d.content_type,
    numPages: d.num_pages,
    external: isExternalDocument(d.type),
    externalUrl: isExternalDocument(d.type) ? d.url : null,
    sizeBytes: sizes.get(d.id) ?? null,
  }));

  return {
    scannedAt: new Date().toISOString(),
    folders: pmFolders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parent_id,
      path: f.path,
      documentCount: f.document_count,
    })),
    documents,
    datarooms,
    links,
    domains: [...domainCounts.entries()]
      .map(([domain, linkCount]) => ({ domain, linkCount }))
      .sort((a, b) => b.linkCount - a.linkCount),
    visitors,
    fileCount: documents.filter((d) => !d.external).length,
    totalBytes: [...sizes.values()].reduce((a, b) => a + b, 0),
  };
}
