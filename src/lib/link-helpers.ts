import "server-only";
import { db } from "@/lib/db";
import { interleave } from "@/lib/dataroom-nav";
import { requestHost } from "@/lib/origin";
import type { EditorLink, TreeItem } from "@/components/links/link-editor";
import type { LinkConfig } from "@/lib/link-config";
import type {
  DataroomDocument,
  DataroomFolder,
  Document,
  Link,
  LinkPermission,
} from "@prisma/client";

/**
 * Public URL of a link. Custom domains serve slugs at the root; on the app's
 * own host they live under /view/. The app host comes from the current
 * request so URLs are correct on any port or host the app is served from.
 */
export async function linkUrl(link: {
  slug: string;
  domain?: { domain: string } | null;
}): Promise<string> {
  if (link.domain) return `https://${link.domain.domain}/${link.slug}`;
  const host = await requestHost();
  const proto = host.startsWith("localhost") || host.startsWith("127.")
    ? "http"
    : "https";
  return `${proto}://${host}/view/${link.slug}`;
}

export function toEditorLink(
  link: Link & { permissions?: LinkPermission[] }
): EditorLink {
  return {
    id: link.id,
    name: link.name,
    slug: link.slug,
    domainId: link.domainId,
    accessMode: link.accessMode,
    hasPassword: !!link.passwordHash,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    allowDownload: link.allowDownload,
    allowList: link.allowList,
    blockList: link.blockList,
    screenshotProtection: link.screenshotProtection,
    watermark: link.watermark,
    agreementId: link.agreementId,
    notifyOnAccess: link.notifyOnAccess,
    enableIndexFile: link.enableIndexFile,
    enableQA: link.enableQA,
    welcomeMessage: link.welcomeMessage,
    previewPresetId: link.previewPresetId,
    metaTitle: link.metaTitle,
    metaDescription: link.metaDescription,
    metaImageKey: link.metaImageKey,
    fullAccess: link.fullAccess,
    permissions: (link.permissions ?? []).map((p) => ({
      itemType: p.itemType,
      itemId: p.itemId,
      canView: p.canView,
      canDownload: p.canDownload,
    })) as LinkConfig["permissions"],
  };
}

/** Shared context every link editor needs. */
export async function getEditorContext(teamId: string) {
  const [domains, agreements, presets, previewPresets] = await Promise.all([
    db.domain.findMany({
      where: { teamId, status: "VERIFIED" },
      orderBy: { domain: "asc" },
    }),
    db.agreement.findMany({ where: { teamId }, orderBy: { name: "asc" } }),
    db.linkPreset.findMany({
      where: { teamId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    db.previewPreset.findMany({
      where: { teamId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
  ]);
  return {
    appHost: await requestHost(),
    domains: domains.map((d) => ({ id: d.id, domain: d.domain })),
    agreements: agreements.map((a) => ({ id: a.id, name: a.name })),
    presets: presets.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      config: p.config as Partial<LinkConfig>,
    })),
    previewPresets: previewPresets.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
    })),
  };
}

export function buildTree(
  folders: DataroomFolder[],
  documents: (DataroomDocument & { document: Document })[]
): TreeItem[] {
  function childrenOf(parentId: string | null): TreeItem[] {
    // folders and files share one order at each level
    return interleave(
      folders.filter((f) => f.parentId === parentId),
      documents.filter((d) => d.folderId === parentId)
    ).map((child) =>
      child.kind === "folder"
        ? {
            kind: "folder" as const,
            id: child.item.id,
            name: child.item.name,
            children: childrenOf(child.item.id),
          }
        : {
            kind: "document" as const,
            id: child.item.id,
            name: child.item.document.name,
            docType: child.item.document.type,
          }
    );
  }
  return childrenOf(null);
}
