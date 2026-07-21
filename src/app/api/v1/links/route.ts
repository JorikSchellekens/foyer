import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { originFromRequest } from "@/lib/origin";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";

export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Internal visits (team members opening their own links) are not counted.
  const extFilter = externalViews(await teamMemberEmails(auth.teamId));
  const links = await db.link.findMany({
    where: { teamId: auth.teamId },
    include: {
      domain: true,
      document: true,
      dataroom: true,
      _count: { select: { views: { where: extFilter } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id,
      name: l.name,
      url: l.domain
        ? `https://${l.domain.domain}/${l.slug}`
        : `${originFromRequest(req)}/view/${l.slug}`,
      target: l.target,
      targetId: l.documentId ?? l.dataroomId,
      targetName: l.document?.name ?? l.dataroom?.name,
      accessMode: l.accessMode,
      active: !l.isArchived,
      views: l._count.views,
      createdAt: l.createdAt,
    })),
  });
}

const createSchema = z.object({
  targetType: z.enum(["DOCUMENT", "DATAROOM"]),
  targetId: z.string(),
  name: z.string().min(1),
  accessMode: z.enum(["PUBLIC", "EMAIL", "EMAIL_VERIFIED"]).default("PUBLIC"),
  allowDownload: z.boolean().default(true),
  watermark: z.boolean().default(false),
  screenshotProtection: z.boolean().default(false),
  expiresInDays: z.number().int().positive().optional(),
  allowList: z.array(z.string()).default([]),
  blockList: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateApi(req);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  const body = parsed.data;

  const target =
    body.targetType === "DOCUMENT"
      ? await db.document.findFirst({
          where: { id: body.targetId, teamId: auth.teamId },
        })
      : await db.dataroom.findFirst({
          where: { id: body.targetId, teamId: auth.teamId },
        });
  if (!target)
    return NextResponse.json({ error: "Target not found" }, { status: 404 });

  const link = await db.link.create({
    data: {
      teamId: auth.teamId,
      target: body.targetType,
      documentId: body.targetType === "DOCUMENT" ? body.targetId : null,
      dataroomId: body.targetType === "DATAROOM" ? body.targetId : null,
      name: body.name,
      slug: generateSlug(),
      accessMode: body.accessMode,
      allowDownload: body.allowDownload,
      watermark: body.watermark,
      screenshotProtection: body.screenshotProtection,
      allowList: body.allowList,
      blockList: body.blockList,
      expiresAt: body.expiresInDays
        ? new Date(Date.now() + body.expiresInDays * 86400_000)
        : null,
    },
  });
  return NextResponse.json(
    {
      id: link.id,
      url: `${originFromRequest(req)}/view/${link.slug}`,
    },
    { status: 201 }
  );
}
