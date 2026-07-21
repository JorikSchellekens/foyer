"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { docTypeFromName } from "@/lib/doc-types";
import { notifyTeam } from "@/lib/notify";
import type { UploadedFile } from "@/app/(app)/documents/actions";

function bust(id?: string) {
  revalidatePath("/datarooms");
  if (id) revalidatePath(`/datarooms/${id}`);
}

async function ownDataroom(id: string) {
  const ctx = await requireTeam();
  const dataroom = await db.dataroom.findFirst({
    where: { id, teamId: ctx.team.id },
  });
  return dataroom ? { ctx, dataroom } : null;
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
  const ctx = await requireTeam();
  await db.dataroom.updateMany({
    where: { id, teamId: ctx.team.id },
    data: { name: data.name?.trim() || undefined, description: data.description },
  });
  bust(id);
}

export async function deleteDataroom(id: string) {
  const ctx = await requireTeam();
  await db.dataroom.deleteMany({ where: { id, teamId: ctx.team.id } });
  bust();
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

// ---------- groups ----------

export async function saveGroup(
  dataroomId: string,
  group: {
    id?: string;
    name: string;
    emails: string[];
    fullAccess: boolean;
    allowDownload: boolean;
    permissions: {
      itemType: "DATAROOM_DOCUMENT" | "DATAROOM_FOLDER";
      itemId: string;
      canView: boolean;
      canDownload: boolean;
    }[];
  }
) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return { error: "Data room not found." };
  if (!group.name.trim()) return { error: "Group name is required." };

  const emails = [
    ...new Set(
      group.emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"))
    ),
  ];

  const data = {
    name: group.name.trim(),
    fullAccess: group.fullAccess,
    allowDownload: group.allowDownload,
  };

  if (group.id) {
    const existing = await db.viewerGroup.findFirst({
      where: { id: group.id, dataroomId },
    });
    if (!existing) return { error: "Group not found." };
    await db.viewerGroup.update({
      where: { id: group.id },
      data: {
        ...data,
        members: {
          deleteMany: {},
          create: emails.map((email) => ({ email })),
        },
        permissions: {
          deleteMany: {},
          create: group.permissions,
        },
      },
    });
  } else {
    await db.viewerGroup.create({
      data: {
        ...data,
        dataroomId,
        members: { create: emails.map((email) => ({ email })) },
        permissions: { create: group.permissions },
      },
    });
  }
  bust(dataroomId);
  return { ok: true };
}

export async function deleteGroup(dataroomId: string, groupId: string) {
  const owned = await ownDataroom(dataroomId);
  if (!owned) return;
  await db.viewerGroup.deleteMany({ where: { id: groupId, dataroomId } });
  bust(dataroomId);
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
  const owned = await ownDataroom(dataroomId);
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
