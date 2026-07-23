"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireTeam } from "@/lib/auth";
import { canAccessDataroom } from "@/lib/permissions";
import { db } from "@/lib/db";
import { docTypeFromName } from "@/lib/doc-types";
import { parseNotionUrl } from "@/lib/notion";
import { notifyTeam } from "@/lib/notify";
import { isTeamKey } from "@/lib/storage";
import type { PermissionLevel } from "@prisma/client";
import type { UploadedFile } from "@/app/(app)/documents/actions";

function bust(id?: string) {
  revalidatePath("/datarooms");
  if (id) revalidatePath(`/datarooms/${id}`);
}

/**
 * Resolve a team-owned data room, requiring the caller to hold at least
 * `level` on it. OWNER/ADMIN always pass; a MEMBER passes if unrestricted or
 * explicitly granted the level. Returns null when missing or not permitted.
 */
async function ownDataroom(id: string, level: PermissionLevel = "EDIT") {
  const ctx = await requireTeam();
  const dataroom = await db.dataroom.findFirst({
    where: { id, teamId: ctx.team.id },
  });
  if (!dataroom) return null;
  if (!(await canAccessDataroom(ctx, id, level))) return null;
  return { ctx, dataroom };
}

export async function createDataroom(name: string, description?: string) {
  const ctx = await requireTeam();
  if (!name.trim()) return { error: "Give the data room a name." };
  const dataroom = await db.dataroom.create({
    data: { teamId: ctx.team.id, name: name.trim(), description },
  });
  bust();
  return { id: dataroom.id };
}

export async function updateDataroom(
  id: string,
  data: { name?: string; description?: string | null }
) {
  const owned = await ownDataroom(id, "EDIT");
  if (!owned) return { error: "Data room not found." };
  await db.dataroom.update({
    where: { id },
    data: { name: data.name?.trim() || undefined, description: data.description },
  });
  bust(id);
  return { ok: true };
}

export async function deleteDataroom(id: string) {
  const owned = await ownDataroom(id, "MANAGE");
  if (!owned) return { error: "Data room not found." };
  await db.dataroom.delete({ where: { id } });
  bust();
  return { ok: true };
}

export async function createDataroomFolder(
  dataroomId: string,
  name: string,
  parentId: string | null
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return { error: "Data room not found." };
  if (!name.trim()) return { error: "Folder name is required." };
  await db.dataroomFolder.create({
    data: { dataroomId, name: name.trim(), parentId },
  });
  bust(dataroomId);
  return { ok: true };
}

export async function renameDataroomFolder(
  dataroomId: string,
  folderId: string,
  name: string
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return;
  await db.dataroomFolder.updateMany({
    where: { id: folderId, dataroomId },
    data: { name: name.trim() || "Untitled" },
  });
  bust(dataroomId);
}

export async function deleteDataroomFolder(
  dataroomId: string,
  folderId: string
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return;
  await db.dataroomFolder.deleteMany({ where: { id: folderId, dataroomId } });
  bust(dataroomId);
}

/** Add existing library documents to a dataroom folder. */
export async function addDocumentsToDataroom(
  dataroomId: string,
  documentIds: string[],
  folderId: string | null
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return { error: "Data room not found." };
  const docs = await db.document.findMany({
    where: { id: { in: documentIds }, teamId: owned.ctx.team.id },
  });
  const max = await db.dataroomDocument.aggregate({
    where: { dataroomId },
    _max: { orderIndex: true },
  });
  let order = (max._max.orderIndex ?? 0) + 1;
  for (const doc of docs) {
    await db.dataroomDocument.upsert({
      where: { dataroomId_documentId: { dataroomId, documentId: doc.id } },
      update: { folderId },
      create: { dataroomId, documentId: doc.id, folderId, orderIndex: order++ },
    });
  }
  bust(dataroomId);
  return { added: docs.length };
}

/** Upload files straight into a dataroom (also lands them in the library). */
export async function uploadIntoDataroom(
  dataroomId: string,
  uploads: UploadedFile[],
  folderId: string | null
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return { error: "Data room not found." };
  const { ctx } = owned;

  // mirror folder structure from relativeDir inside the dataroom
  async function ensureDrPath(relativeDir: string): Promise<string | null> {
    let parentId = folderId;
    for (const part of relativeDir.split("/").filter(Boolean)) {
      const existing = await db.dataroomFolder.findFirst({
        where: { dataroomId, parentId, name: part },
      });
      parentId = existing
        ? existing.id
        : (
            await db.dataroomFolder.create({
              data: { dataroomId, parentId, name: part },
            })
          ).id;
    }
    return parentId;
  }

  const max = await db.dataroomDocument.aggregate({
    where: { dataroomId },
    _max: { orderIndex: true },
  });
  let order = (max._max.orderIndex ?? 0) + 1;

  for (const up of uploads.slice(0, 500)) {
    // Only trust keys under this team's prefix (see isTeamKey).
    if (!isTeamKey(up.key, ctx.team.id)) continue;
    const type = docTypeFromName(up.name);
    const doc = await db.document.create({
      data: {
        teamId: ctx.team.id,
        name: up.name.replace(/\.[^.]+$/, ""),
        type,
        versions: {
          create: {
            versionNumber: 1,
            fileKey: up.key,
            fileName: up.name,
            fileSize: up.size,
            contentType: up.contentType,
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
    const targetFolder = up.relativeDir
      ? await ensureDrPath(up.relativeDir)
      : folderId;
    await db.dataroomDocument.create({
      data: {
        dataroomId,
        documentId: doc.id,
        folderId: targetFolder,
        orderIndex: order++,
      },
    });
  }
  bust(dataroomId);
  revalidatePath("/documents");
  return { added: uploads.length };
}

/** Add a published Notion page as a live asset straight into a dataroom. */
export async function addNotionToDataroom(
  dataroomId: string,
  url: string,
  folderId: string | null
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return { error: "Data room not found." };
  const { ctx } = owned;

  const parsed = parseNotionUrl(url);
  if ("error" in parsed) return parsed;

  const doc = await db.document.create({
    data: {
      teamId: ctx.team.id,
      name: parsed.name,
      type: "NOTION",
      externalUrl: parsed.url,
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

  const max = await db.dataroomDocument.aggregate({
    where: { dataroomId },
    _max: { orderIndex: true },
  });
  await db.dataroomDocument.create({
    data: {
      dataroomId,
      documentId: doc.id,
      folderId,
      orderIndex: (max._max.orderIndex ?? 0) + 1,
    },
  });

  bust(dataroomId);
  revalidatePath("/documents");
  return { added: 1 };
}

export async function removeFromDataroom(
  dataroomId: string,
  dataroomDocumentId: string
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return;
  await db.dataroomDocument.deleteMany({
    where: { id: dataroomDocumentId, dataroomId },
  });
  bust(dataroomId);
}

export async function moveDataroomItem(
  dataroomId: string,
  dataroomDocumentId: string,
  folderId: string | null
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return;
  await db.dataroomDocument.updateMany({
    where: { id: dataroomDocumentId, dataroomId },
    data: { folderId },
  });
  bust(dataroomId);
}

/**
 * Re-parent a folder (null = root). Refuses drops into itself or any of its
 * descendants, which would detach the subtree from the room.
 */
export async function moveDataroomFolder(
  dataroomId: string,
  folderId: string,
  newParentId: string | null
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return { error: "Data room not found." };
  if (folderId === newParentId)
    return { error: "A folder cannot contain itself." };
  const folders = await db.dataroomFolder.findMany({
    where: { dataroomId },
    select: { id: true, parentId: true },
  });
  const byId = new Map(folders.map((f) => [f.id, f]));
  if (!byId.has(folderId)) return { error: "Folder not found." };
  if (newParentId) {
    if (!byId.has(newParentId))
      return { error: "Destination folder not found." };
    // walk up from the destination; reaching the moved folder means a cycle
    let cursor: string | null = newParentId;
    while (cursor) {
      if (cursor === folderId)
        return { error: "A folder cannot move into its own subfolder." };
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }
  await db.dataroomFolder.update({
    where: { id: folderId },
    data: { parentId: newParentId },
  });
  bust(dataroomId);
  return { ok: true };
}

/**
 * Persist a new visitor-facing order for the documents in one folder. Ids must
 * all belong to the data room; their position in the array becomes orderIndex.
 */
export async function reorderDataroomDocuments(
  dataroomId: string,
  orderedIds: string[]
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return;
  await db.$transaction(
    orderedIds.map((id, index) =>
      db.dataroomDocument.updateMany({
        where: { id, dataroomId },
        data: { orderIndex: index },
      })
    )
  );
  bust(dataroomId);
}

// ---------- member access ----------

/**
 * Grant a team member a level of access to this data room (or revoke it with
 * NONE). Only OWNER/ADMIN may manage access. A MEMBER with no grants on any
 * room sees every room; setting a level here restricts them to the rooms they
 * are explicitly granted. OWNER/ADMIN always have full access, so scoping them
 * is a no-op we reject.
 */
export async function setDataroomMemberAccess(
  dataroomId: string,
  memberId: string,
  level: PermissionLevel | "NONE"
) {
  const ctx = await requireRole(); // OWNER/ADMIN only
  const dataroom = await db.dataroom.findFirst({
    where: { id: dataroomId, teamId: ctx.team.id },
  });
  if (!dataroom) return { error: "Data room not found." };

  const member = await db.teamMember.findFirst({
    where: { id: memberId, teamId: ctx.team.id },
  });
  if (!member) return { error: "Member not found." };
  if (member.role !== "MEMBER")
    return { error: "Admins and owners already have access to every room." };

  if (level === "NONE") {
    await db.resourcePermission.deleteMany({
      where: { memberId, resourceType: "DATAROOM", resourceId: dataroomId },
    });
  } else {
    await db.resourcePermission.upsert({
      where: {
        memberId_resourceType_resourceId: {
          memberId,
          resourceType: "DATAROOM",
          resourceId: dataroomId,
        },
      },
      update: { level },
      create: {
        memberId,
        resourceType: "DATAROOM",
        resourceId: dataroomId,
        level,
      },
    });
  }
  bust(dataroomId);
  return { ok: true };
}

// ---------- Q&A ----------

export async function answerQuestion(
  dataroomId: string,
  questionId: string,
  answer: string
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return { error: "Data room not found." };
  await db.dataroomQuestion.updateMany({
    where: { id: questionId, dataroomId },
    data: {
      answer: answer.trim(),
      answeredBy: owned.ctx.user.email,
      answeredAt: new Date(),
    },
  });
  bust(dataroomId);
  return { ok: true };
}

export async function askQuestionAsTeam(dataroomId: string, body: string) {
  const owned = await ownDataroom(dataroomId, "VIEW");
  if (!owned) return { error: "Data room not found." };
  await db.dataroomQuestion.create({
    data: { dataroomId, body: body.trim(), viewerEmail: owned.ctx.user.email },
  });
  await notifyTeam(owned.ctx.team.id, "new_question", {
    who: owned.ctx.user.email,
    itemName: owned.dataroom.name,
    detail: body.trim(),
    href: `/datarooms/${dataroomId}?tab=qa`,
  });
  bust(dataroomId);
  return { ok: true };
}
