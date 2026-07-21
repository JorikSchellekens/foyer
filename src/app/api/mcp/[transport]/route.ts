import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashApiKey } from "@/lib/tokens";
import { generateSlug } from "@/lib/slug";
import { appHost } from "@/lib/cloudflare";
import { formatDuration } from "@/lib/format";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";

type Auth = {
  token: string;
  clientId: string;
  scopes: string[];
  extra: { teamId: string; userId: string };
};

async function teamFromAuth(extra: unknown): Promise<string> {
  const info = (extra as { authInfo?: Auth })?.authInfo;
  if (!info?.extra?.teamId) throw new Error("Unauthorized");
  return info.extra.teamId;
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_documents",
      "List documents in the workspace library, with view counts. Optionally filter by a search query.",
      { query: z.string().optional() },
      async ({ query }, extra) => {
        const teamId = await teamFromAuth(extra);
        const extFilter = externalViews(await teamMemberEmails(teamId));
        const docs = await db.document.findMany({
          where: {
            teamId,
            ...(query
              ? { name: { contains: query, mode: "insensitive" } }
              : {}),
          },
          include: {
            currentVersion: true,
            _count: { select: { views: { where: extFilter }, links: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                docs.map((d) => ({
                  id: d.id,
                  name: d.name,
                  type: d.type,
                  pages: d.currentVersion?.numPages ?? null,
                  views: d._count.views,
                  links: d._count.links,
                  updatedAt: d.updatedAt,
                })),
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.tool(
      "list_datarooms",
      "List data rooms with document and visit counts.",
      {},
      async (_args, extra) => {
        const teamId = await teamFromAuth(extra);
        const extFilter = externalViews(await teamMemberEmails(teamId));
        const rooms = await db.dataroom.findMany({
          where: { teamId },
          include: {
            _count: {
              select: {
                documents: true,
                views: { where: extFilter },
                links: true,
              },
            },
          },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                rooms.map((r) => ({
                  id: r.id,
                  name: r.name,
                  documents: r._count.documents,
                  visits: r._count.views,
                  links: r._count.links,
                })),
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.tool(
      "list_links",
      "List sharing links with their URLs and view counts.",
      {},
      async (_args, extra) => {
        const teamId = await teamFromAuth(extra);
        const extFilter = externalViews(await teamMemberEmails(teamId));
        const links = await db.link.findMany({
          where: { teamId },
          include: {
            domain: true,
            document: true,
            dataroom: true,
            _count: { select: { views: { where: extFilter } } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                links.map((l) => ({
                  id: l.id,
                  name: l.name,
                  url: `https://${l.domain?.domain ?? appHost()}/${
                    l.domain ? l.slug : `view/${l.slug}`
                  }`,
                  shares: l.document?.name ?? l.dataroom?.name,
                  accessMode: l.accessMode,
                  active: !l.isArchived,
                  views: l._count.views,
                })),
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.tool(
      "create_link",
      "Create a sharing link for a document or data room. Returns the URL.",
      {
        targetType: z.enum(["DOCUMENT", "DATAROOM"]),
        targetId: z.string(),
        name: z.string(),
        accessMode: z.enum(["PUBLIC", "EMAIL", "EMAIL_VERIFIED"]).default("PUBLIC"),
        allowDownload: z.boolean().default(true),
        watermark: z.boolean().default(false),
        expiresInDays: z.number().int().positive().optional(),
      },
      async (args, extra) => {
        const teamId = await teamFromAuth(extra);
        const target =
          args.targetType === "DOCUMENT"
            ? await db.document.findFirst({
                where: { id: args.targetId, teamId },
              })
            : await db.dataroom.findFirst({
                where: { id: args.targetId, teamId },
              });
        if (!target)
          return {
            content: [{ type: "text", text: "Error: target not found" }],
            isError: true,
          };
        const link = await db.link.create({
          data: {
            teamId,
            target: args.targetType,
            documentId: args.targetType === "DOCUMENT" ? args.targetId : null,
            dataroomId: args.targetType === "DATAROOM" ? args.targetId : null,
            name: args.name,
            slug: generateSlug(),
            accessMode: args.accessMode,
            allowDownload: args.allowDownload,
            watermark: args.watermark,
            expiresAt: args.expiresInDays
              ? new Date(Date.now() + args.expiresInDays * 86400_000)
              : null,
          },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: link.id,
                url: `https://${appHost()}/view/${link.slug}`,
              }),
            },
          ],
        };
      }
    );

    server.tool(
      "get_link_analytics",
      "Visits for a link: who, when, time spent, completion.",
      { linkId: z.string() },
      async ({ linkId }, extra) => {
        const teamId = await teamFromAuth(extra);
        const extFilter = externalViews(await teamMemberEmails(teamId));
        const link = await db.link.findFirst({
          where: { id: linkId, teamId },
          include: {
            views: { where: extFilter, orderBy: { startedAt: "desc" }, take: 100 },
          },
        });
        if (!link)
          return {
            content: [{ type: "text", text: "Error: link not found" }],
            isError: true,
          };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  name: link.name,
                  totalViews: link.views.length,
                  views: link.views.map((v) => ({
                    email: v.viewerEmail ?? "anonymous",
                    verified: v.verified,
                    startedAt: v.startedAt,
                    timeSpent: formatDuration(v.totalDuration),
                    completedPct: v.completedPct,
                    downloaded: !!v.downloadedAt,
                    location: [v.city, v.country].filter(Boolean).join(", "),
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.tool(
      "list_visitors",
      "List visitors (by email) with visit counts and total reading time.",
      {},
      async (_args, extra) => {
        const teamId = await teamFromAuth(extra);
        // Team members are internal, not visitors - keep them out of the list.
        const members = await teamMemberEmails(teamId);
        const viewers = await db.viewer.findMany({
          where: { teamId, email: { notIn: members } },
          include: { views: { select: { totalDuration: true } } },
          take: 200,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                viewers.map((v) => ({
                  id: v.id,
                  email: v.email,
                  verified: v.verified,
                  visits: v.views.length,
                  totalTime: formatDuration(
                    v.views.reduce((s, x) => s + x.totalDuration, 0)
                  ),
                })),
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.tool(
      "get_visitor_activity",
      "Full reading history for a visitor email: documents, time spent per visit.",
      { email: z.string() },
      async ({ email }, extra) => {
        const teamId = await teamFromAuth(extra);
        const viewer = await db.viewer.findUnique({
          where: { teamId_email: { teamId, email: email.toLowerCase() } },
          include: {
            views: {
              orderBy: { startedAt: "desc" },
              include: { document: true, dataroom: true, link: true },
              take: 200,
            },
          },
        });
        if (!viewer)
          return {
            content: [{ type: "text", text: "No visitor with that email." }],
          };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                viewer.views.map((v) => ({
                  item:
                    v.document?.name ??
                    (v.dataroom ? `${v.dataroom.name} (index)` : v.link.name),
                  link: v.link.name,
                  startedAt: v.startedAt,
                  timeSpent: formatDuration(v.totalDuration),
                  completedPct: v.completedPct,
                  downloaded: !!v.downloadedAt,
                })),
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.tool(
      "invite_recipients",
      "Email personal, optionally expiring access links for an existing link.",
      {
        linkId: z.string(),
        emails: z.array(z.string()),
        expiresInDays: z.number().int().positive().optional(),
      },
      async ({ linkId, emails, expiresInDays }, extra) => {
        const teamId = await teamFromAuth(extra);
        const link = await db.link.findFirst({
          where: { id: linkId, teamId },
          include: { document: true, dataroom: true, team: true, domain: true },
        });
        if (!link)
          return {
            content: [{ type: "text", text: "Error: link not found" }],
            isError: true,
          };
        const { randomToken } = await import("@/lib/tokens");
        const { sendLinkInvite, appUrl } = await import("@/lib/email");
        const expiresAt = expiresInDays
          ? new Date(Date.now() + expiresInDays * 86400_000)
          : null;
        let sent = 0;
        for (const raw of emails) {
          const email = raw.trim().toLowerCase();
          if (!email.includes("@")) continue;
          const token = randomToken(24);
          await db.linkRecipient.upsert({
            where: { linkId_email: { linkId, email } },
            update: { token, expiresAt, lastSentAt: new Date() },
            create: { linkId, email, token, expiresAt },
          });
          await sendLinkInvite({
            email,
            url: link.domain
              ? `https://${link.domain.domain}/t/${token}`
              : appUrl(`/view/t/${token}`),
            itemName: link.document?.name ?? link.dataroom?.name ?? link.name,
            teamName: link.team.name,
            expiresAt,
          });
          sent++;
        }
        return {
          content: [{ type: "text", text: `Sent ${sent} invitation(s).` }],
        };
      }
    );
  },
  {},
  { basePath: "/api/mcp" }
);

const verifyToken = async (_req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  const token = await db.apiToken.findUnique({
    where: { hashedKey: hashApiKey(bearerToken) },
  });
  if (!token) return undefined;
  db.apiToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return {
    token: bearerToken,
    clientId: token.userId,
    scopes: ["all"],
    extra: { teamId: token.teamId, userId: token.userId },
  };
};

const authed = withMcpAuth(handler, verifyToken, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
