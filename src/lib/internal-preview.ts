import "server-only";
import { db } from "@/lib/db";
import { linkInclude, type FullLink } from "@/lib/access";
import type { TeamContext } from "@/lib/auth";

/**
 * A stand-in link for a team member's internal look at a whole data room:
 * everything visible, nothing gated, nothing recorded, no downloads, no Q&A.
 * It never touches the database as a link. It only lets the visitor-facing
 * index and viewer render without a real access link, so a room can be
 * previewed before it is shared (and as a whole, whatever each link grants).
 */
export async function internalDataroomLink(
  ctx: TeamContext,
  dataroomId: string
): Promise<FullLink | null> {
  const dataroom = await db.dataroom.findFirst({
    where: { id: dataroomId, teamId: ctx.team.id },
    include: linkInclude.dataroom.include,
  });
  if (!dataroom) return null;

  const now = new Date();
  return {
    id: `internal-preview-${dataroom.id}`,
    teamId: ctx.team.id,
    target: "DATAROOM",
    documentId: null,
    dataroomId: dataroom.id,
    name: dataroom.name,
    slug: "",
    domainId: null,
    accessMode: "PUBLIC",
    passwordHash: null,
    expiresAt: null,
    allowDownload: false,
    allowList: [],
    blockList: [],
    screenshotProtection: false,
    watermark: false,
    agreementId: null,
    notifyOnAccess: false,
    enableIndexFile: false,
    enableQA: false,
    fullAccess: true,
    welcomeMessage: null,
    previewPresetId: null,
    metaTitle: null,
    metaDescription: null,
    metaImageKey: null,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    team: ctx.team,
    domain: null,
    agreement: null,
    previewPreset: null,
    document: null,
    dataroom,
    permissions: [],
  };
}

export const INTERNAL_PREVIEW_TEXT =
  "Internal look at the whole data room. Nothing is recorded.";
