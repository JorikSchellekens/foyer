"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { docTypeFromName } from "@/lib/doc-types";
import { getObjectBuffer } from "@/lib/storage";

async function countPdfPages(fileKey: string): Promise<number | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const buf = await getObjectBuffer(fileKey);
    const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

/** Ensure nested library folders exist for a relative path like "Reports/2025". */
async function ensureFolderPath(
  teamId: string,
  rootFolderId: string | null,
  relativeDir: string
): Promise<string | null> {
  let parentId = rootFolderId;
  for (const part of relativeDir.split("/").filter(Boolean)) {
    const existing = await db.folder.findFirst({
      where: { teamId, parentId, name: part },
    });
    if (existing) {
      parentId = existing.id;
    } else {
      const created = await db.folder.create({
        data: { teamId, parentId, name: part },
      });
      parentId = created.id;
    }
  }
  return parentId;
}

export type UploadedFile = {
  key: string;
  name: string;
  size: number;
  contentType: string;
  /** directory portion of webkitRelativePath, "" for plain files */
  relativeDir: string;
};

export async function createUploadedDocuments(
  uploads: UploadedFile[],
  folderId: string | null
) {
  const ctx = await requireTeam();
  const created: string[] = [];
  for (const up of uploads.slice(0, 500)) {
    const targetFolder = up.relativeDir
      ? await ensureFolderPath(ctx.team.id, folderId, up.relativeDir)
      : folderId;
    const type = docTypeFromName(up.name);
    const numPages = type === "PDF" ? await countPdfPages(up.key) : null;
    const doc = await db.document.create({
      data: {
        teamId: ctx.team.id,
        folderId: targetFolder,
        name: up.name.replace(/\.[^.]+$/, ""),
        type,
        versions: {
          create: {
            versionNumber: 1,
            fileKey: up.key,
            fileName: up.name,
            fileSize: up.size,
            contentType: up.contentType,
            numPages,
            uploadedById: ctx.user.id,
          },
        },
      },
      include: { versions: true },
    });
    await db.document.update({
      where: { id: doc.id },
      data: { currentVersionId: doc.versions[0].id },
    });
    created.push(doc.id);
  }
  revalidatePath("/documents");
  return { created: created.length };
}

export async function createNotionDocument(
  url: string,
  folderId: string | null
) {
  const ctx = await requireTeam();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "Enter a valid Notion URL." };
  }
  if (!parsed.hostname.endsWith("notion.site") && !parsed.hostname.endsWith("notion.so"))
    return { error: "Only public notion.site or notion.so links are supported." };

  const name = decodeURIComponent(
    parsed.pathname.split("/").filter(Boolean).pop() ?? "Notion page"
  )
    .replace(/-[a-f0-9]{32}$/i, "")
    .replace(/-/g, " ");

  const doc = await db.document.create({
    data: {
      teamId: ctx.team.id,
      folderId,
      name: name || "Notion page",
      type: "NOTION",
      externalUrl: url,
      versions: {
        create: {
          versionNumber: 1,
          fileName: "notion",
          contentType: "text/html",
          uploadedById: ctx.user.id,
        },
      },
    },
    include: { versions: true },
  });
  await db.document.update({
    where: { id: doc.id },
    data: { currentVersionId: doc.versions[0].id },
  });
  revalidatePath("/documents");
  return { id: doc.id };
}

export async function uploadNewVersion(
  documentId: string,
  upload: Omit<UploadedFile, "relativeDir">,
  note?: string
) {
  const ctx = await requireTeam();
  const doc = await db.document.findFirst({
    where: { id: documentId, teamId: ctx.team.id },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!doc) return { error: "Document not found." };
  const nextNumber = (doc.versions[0]?.versionNumber ?? 0) + 1;
  const type = docTypeFromName(upload.name);
  const numPages = type === "PDF" ? await countPdfPages(upload.key) : null;
  const version = await db.documentVersion.create({
    data: {
      documentId,
      versionNumber: nextNumber,
      fileKey: upload.key,
      fileName: upload.name,
      fileSize: upload.size,
      contentType: upload.contentType,
      numPages,
      uploadedById: ctx.user.id,
      note: note || null,
    },
  });
  await db.document.update({
    where: { id: documentId },
    data: { currentVersionId: version.id, type },
  });
  revalidatePath(`/documents/${documentId}`);
  return { ok: true };
}

export async function restoreVersion(documentId: string, versionId: string) {
  const ctx = await requireTeam();
  const version = await db.documentVersion.findFirst({
    where: { id: versionId, documentId, document: { teamId: ctx.team.id } },
  });
  if (!version) return { error: "Version not found." };
  await db.document.update({
    where: { id: documentId },
    data: { currentVersionId: versionId },
  });
  revalidatePath(`/documents/${documentId}`);
  return { ok: true };
}

export async function createFolder(name: string, parentId: string | null) {
  const ctx = await requireTeam();
  if (!name.trim()) return { error: "Folder name is required." };
  await db.folder.create({
    data: { teamId: ctx.team.id, parentId, name: name.trim() },
  });
  revalidatePath("/documents");
  return { ok: true };
}

export async function renameDocument(id: string, name: string) {
  const ctx = await requireTeam();
  await db.document.updateMany({
    where: { id, teamId: ctx.team.id },
    data: { name: name.trim() || "Untitled" },
  });
  revalidatePath("/documents");
  revalidatePath(`/documents/${id}`);
}

export async function deleteDocument(id: string) {
  const ctx = await requireTeam();
  await db.document.deleteMany({ where: { id, teamId: ctx.team.id } });
  revalidatePath("/documents");
}

export async function renameFolder(id: string, name: string) {
  const ctx = await requireTeam();
  await db.folder.updateMany({
    where: { id, teamId: ctx.team.id },
    data: { name: name.trim() || "Untitled" },
  });
  revalidatePath("/documents");
}

export async function deleteFolder(id: string) {
  const ctx = await requireTeam();
  await db.folder.deleteMany({ where: { id, teamId: ctx.team.id } });
  revalidatePath("/documents");
}

export async function moveDocument(id: string, folderId: string | null) {
  const ctx = await requireTeam();
  await db.document.updateMany({
    where: { id, teamId: ctx.team.id },
    data: { folderId },
  });
  revalidatePath("/documents");
}
