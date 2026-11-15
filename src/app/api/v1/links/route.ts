import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { admitApi } from "@/lib/api-rest";
import { visibilityFor } from "@/lib/api-visibility";
import { appOrigin } from "@/lib/mcp/context";
import { canAccessDataroom } from "@/lib/permissions";
import { recordApiEvent } from "@/lib/api-audit";
import { db } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";

export async function GET(req: NextRequest) {
  const admitted = await admitApi(req, "read");
  if ("response" in admitted) return admitted.response;
  const auth = admitted.principal;
  const v = await visibilityFor(auth);

  // Internal visits (team members opening their own links) are not counted.
  const extFilter = externalViews(await teamMemberEmails(auth.teamId));
  const links = await db.link.findMany({
    where: v.link,
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
        : `${appOrigin()}/view/${l.slug}`,
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

/** An email, or a domain such as "@acme.com". */
const listEntry = z
  .string()
  .max(254)
  .transform((s) => s.trim().toLowerCase())
  .refine(
    (s) =>
      /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) ||
      /^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s),
    "Use an email address or a domain such as @acme.com"
  );

const createSchema = z.strictObject({
  targetType: z.enum(["DOCUMENT", "DATAROOM"]),
  targetId: z.string().regex(/^[a-zA-Z0-9]{8,40}$/),
  name: z.string().trim().min(1).max(120),
  accessMode: z.enum(["PUBLIC", "EMAIL", "EMAIL_VERIFIED"]).default("PUBLIC"),
  allowDownload: z.boolean().default(true),
  watermark: z.boolean().default(false),
  screenshotProtection: z.boolean().default(false),
  expiresInDays: z.number().int().positive().max(3650).optional(),
  allowList: z.array(listEntry).max(500).default([]),
  blockList: z.array(listEntry).max(500).default([]),
});

export async function POST(req: NextRequest) {
  const admitted = await admitApi(req, "share");
  if ("response" in admitted) return admitted.response;
  const auth = admitted.principal;
  const v = await visibilityFor(auth);

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  const body = parsed.data;

  if (body.allowList.length && body.accessMode !== "EMAIL_VERIFIED")
    return NextResponse.json(
      {
        error:
          "An allow list only protects a link when visitors must prove their email. Use accessMode EMAIL_VERIFIED with allowList.",
      },
      { status: 400 }
    );

  const target =
    body.targetType === "DOCUMENT"
      ? await db.document.findFirst({
          where: { AND: [{ id: body.targetId }, v.docEdit] },
        })
      : await db.dataroom.findFirst({
          where: { id: body.targetId, teamId: auth.teamId },
        });
  if (!target)
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  // Same rule as the app: sharing a data room needs edit access to it.
  if (
    body.targetType === "DATAROOM" &&
    !(await canAccessDataroom(auth.ctx, body.targetId, "EDIT"))
  )
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
  await recordApiEvent(auth, {
    tool: "rest:create_link",
    summary: `Created ${body.accessMode} link "${link.name}" for ${body.targetType.toLowerCase()} "${target.name}"`,
  });
  return NextResponse.json(
    {
      id: link.id,
      url: `${appOrigin()}/view/${link.slug}`,
    },
    { status: 201 }
  );
}
