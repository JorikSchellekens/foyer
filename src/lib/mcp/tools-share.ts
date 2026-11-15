import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { hashPassword, randomToken } from "@/lib/tokens";
import { parseAddress } from "@/lib/email-address";
import { isEmailAllowed } from "@/lib/access";
import { dispatchWebhooks } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { teamMemberEmails, externalViews } from "@/lib/internal-views";
import { createHash } from "crypto";
import { liveLink, visibilityFor } from "@/lib/api-visibility";
import {
  ToolError,
  appOrigin,
  clean,
  defineTool,
  id,
  limitKey,
  nameField,
} from "./context";
import { requireRoom } from "./tree";
import { linkOut, requireDoc, requireLink } from "./shared";

const ACCESS = ["EMAIL_VERIFIED", "EMAIL", "PUBLIC"] as const;

const ACCESS_HELP =
  "accessMode: EMAIL_VERIFIED means visitors confirm their email with a code before entering (recommended). EMAIL means visitors type an email that is not checked. PUBLIC means anyone with the URL gets in.";

/** An allow or block list entry: an email, or a domain such as "@acme.com". */
const listEntry = z
  .string()
  .max(254)
  .transform((s) => clean(s).toLowerCase())
  .refine(
    (s) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) || /^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s),
    'Use an email address or a domain such as "@acme.com", not a company name'
  )
  // "acme.com" and "@acme.com" mean the same; store the one spelling.
  .transform((s) => (s.includes("@") ? s : `@${s}`));

const allowList = z
  .array(listEntry)
  .max(500)
  .describe(
    'Only these emails or domains ("@acme.com") may enter; this is how to share with "only people at X". A domain matches that exact domain, not its subdomains. It is only reliable with EMAIL_VERIFIED: with EMAIL anyone can type a listed address. Use the real email domain: if the user named a company but not its domain, ask them. [] means no restriction.'
  );
const blockList = z.array(listEntry).max(500).describe("These emails or domains are refused. [] means nobody is blocked.");
const password = z.string().min(8).max(200);

function expiryFrom(days: number | undefined) {
  return days ? new Date(Date.now() + days * 86400_000) : null;
}

function checkLists(mode: string, allow: string[]) {
  if (mode !== "EMAIL_VERIFIED" && allow.length)
    throw new ToolError(
      `An allow list only protects a link when visitors must prove their email. With ${mode}, anyone can type a listed address and get in. Use accessMode EMAIL_VERIFIED with the allow list.`
    );
}

export function registerShareTools(server: McpServer) {
  defineTool(server, {
    name: "create_sharing_link",
    title: "Create sharing link",
    description: `Create a link that lets people outside the team open one document or a whole data room. This publishes content: only do it when the user asked for a link. Give exactly one of documentId or dataroomId. The defaults are the careful ones (verified email, no downloads); loosen them only when the user asks. ${ACCESS_HELP} The result echoes every protection setting so you can confirm it to the user.`,
    scope: "share",
    openWorld: true,
    input: {
      documentId: id("document").optional(),
      dataroomId: id("data room").optional(),
      name: nameField("Link name", 120)
        .optional()
        .describe("Internal label, for example the recipient or the round. Visitors do not see it. Defaults to the name of what is shared."),
      accessMode: z.enum(ACCESS).default("EMAIL_VERIFIED"),
      allowDownload: z.boolean().default(false),
      watermark: z.boolean().default(false).describe("Overlay each page with the visitor's email and the time."),
      screenshotProtection: z.boolean().default(false),
      password: password.optional().describe("Optional password, at least 8 characters. Visitors need it as well as any email check."),
      expiresInDays: z.number().int().min(1).max(3650).optional().describe("Days until the link stops working. Omit for no expiry."),
      allowList: allowList.default([]),
      blockList: blockList.default([]),
    },
    handler: async (p, a) => {
      if (!!a.documentId === !!a.dataroomId)
        throw new ToolError("Give exactly one of documentId or dataroomId: the thing to share.");
      const v = await visibilityFor(p);
      // Same rule as the app: sharing something needs edit access to it.
      const targetName = a.documentId
        ? (await requireDoc(p, v, a.documentId, "edit")).name
        : (await requireRoom(p, a.dataroomId!, "EDIT")).name;
      checkLists(a.accessMode, a.allowList);
      const name = a.name ?? targetName.slice(0, 120);
      const twin = await db.link.count({
        where: {
          teamId: p.teamId,
          isArchived: false,
          name,
          ...(a.documentId ? { documentId: a.documentId } : { dataroomId: a.dataroomId }),
        },
      });
      const link = await db.link.create({
        data: {
          teamId: p.teamId,
          target: a.documentId ? "DOCUMENT" : "DATAROOM",
          documentId: a.documentId ?? null,
          dataroomId: a.dataroomId ?? null,
          name,
          slug: generateSlug(),
          accessMode: a.accessMode,
          allowDownload: a.allowDownload,
          watermark: a.watermark,
          screenshotProtection: a.screenshotProtection,
          passwordHash: a.password ? hashPassword(a.password) : null,
          expiresAt: expiryFrom(a.expiresInDays),
          allowList: a.allowList,
          blockList: a.blockList,
        },
        include: {
          domain: true,
          document: { select: { id: true, name: true } },
          dataroom: { select: { id: true, name: true } },
        },
      });
      await dispatchWebhooks(p.teamId, "link.created", {
        linkId: link.id,
        name: link.name,
        target: link.target.toLowerCase(),
      }).catch(() => {});
      return {
        data: {
          ...linkOut(link),
          manageUrl: `${appOrigin()}/links/${link.id}`,
          ...(twin
            ? { warning: `There was already an active link named "${name}" for this. If this call was a retry, one is a duplicate; archive it with update_sharing_link.` }
            : {}),
        },
        audit: `Created ${link.accessMode} sharing link "${link.name}" for ${a.documentId ? "document" : "data room"} "${targetName}"${a.allowDownload ? ", downloads on" : ""}${a.allowList.length ? `, allow list: ${a.allowList.join(", ")}` : ""}${link.passwordHash ? ", password set" : ""}${link.expiresAt ? `, expires ${link.expiresAt.toISOString().slice(0, 10)}` : ""}`,
      };
    },
  });

  defineTool(server, {
    name: "update_sharing_link",
    title: "Change sharing link",
    description: `Change a sharing link's protection, or switch it off. Only the fields you give change. Set archived to true to stop the link working at once (its visitors are told it is no longer available); false switches it back on. Links cannot be deleted here, only archived. Loosening protection (PUBLIC, removing a password or an allow list, allowing downloads) exposes content: only do it when the user asked. ${ACCESS_HELP}`,
    scope: "share",
    destructive: true,
    openWorld: true,
    input: {
      linkId: id("sharing link"),
      name: nameField("Link name", 120).optional(),
      archived: z.boolean().optional(),
      accessMode: z.enum(ACCESS).optional(),
      allowDownload: z.boolean().optional(),
      watermark: z.boolean().optional(),
      screenshotProtection: z.boolean().optional(),
      password: password.optional().describe("Set or replace the password."),
      removePassword: z.boolean().optional(),
      expiresInDays: z.number().int().min(1).max(3650).optional().describe("Days from now until the link stops working."),
      removeExpiry: z.boolean().optional(),
      allowList: allowList.optional().describe("Replaces the whole allow list. [] clears it."),
      blockList: blockList.optional().describe("Replaces the whole block list. [] clears it."),
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const link = await requireLink(p, v, a.linkId, true);
      if (a.password && a.removePassword)
        throw new ToolError("Give password or removePassword, not both.");
      if (a.expiresInDays && a.removeExpiry)
        throw new ToolError("Give expiresInDays or removeExpiry, not both.");

      const data: Prisma.LinkUpdateInput = {};
      const changed: string[] = [];
      const set = <K extends keyof Prisma.LinkUpdateInput>(
        key: K,
        value: Prisma.LinkUpdateInput[K],
        label: string
      ) => {
        data[key] = value;
        changed.push(label);
      };
      if (a.name !== undefined && a.name !== link.name) set("name", a.name, `name "${a.name}"`);
      if (a.archived !== undefined && a.archived !== link.isArchived)
        set("isArchived", a.archived, a.archived ? "archived (switched off)" : "switched back on");
      if (a.accessMode !== undefined && a.accessMode !== link.accessMode)
        set("accessMode", a.accessMode, `access ${link.accessMode} -> ${a.accessMode}`);
      if (a.allowDownload !== undefined && a.allowDownload !== link.allowDownload)
        set("allowDownload", a.allowDownload, `downloads ${a.allowDownload ? "on" : "off"}`);
      if (a.watermark !== undefined && a.watermark !== link.watermark)
        set("watermark", a.watermark, `watermark ${a.watermark ? "on" : "off"}`);
      if (a.screenshotProtection !== undefined && a.screenshotProtection !== link.screenshotProtection)
        set("screenshotProtection", a.screenshotProtection, `screenshot protection ${a.screenshotProtection ? "on" : "off"}`);
      if (a.password) set("passwordHash", hashPassword(a.password), "password set");
      if (a.removePassword && link.passwordHash) set("passwordHash", null, "password removed");
      if (a.expiresInDays) {
        const at = expiryFrom(a.expiresInDays)!;
        set("expiresAt", at, `expires ${at.toISOString().slice(0, 10)}`);
      }
      if (a.removeExpiry && link.expiresAt) set("expiresAt", null, "expiry removed");
      if (a.allowList !== undefined)
        set("allowList", a.allowList, `allow list: ${a.allowList.join(", ") || "cleared"}`);
      if (a.blockList !== undefined)
        set("blockList", a.blockList, `block list: ${a.blockList.join(", ") || "cleared"}`);

      // Only when this call touches them: an older link in a weaker
      // combination must still be editable in other respects.
      if (a.accessMode !== undefined || a.allowList !== undefined)
        checkLists(a.accessMode ?? link.accessMode, a.allowList ?? link.allowList);

      const updated = changed.length
        ? await db.link.update({
            where: { id: link.id },
            data,
            include: {
              domain: true,
              document: { select: { id: true, name: true } },
              dataroom: { select: { id: true, name: true } },
            },
          })
        : link;
      return {
        data: { ...linkOut(updated), changed },
        audit: changed.length
          ? `Changed sharing link "${link.name}": ${changed.join("; ")}`
          : undefined,
      };
    },
  });

  defineTool(server, {
    name: "invite_recipients",
    title: "Email invitations to a sharing link",
    description:
      "Send each address its own personal access link by email, from the workspace. Opening it proves the recipient's email, so they skip the email check. This sends real email to people outside the team: only do it when the user gave you the addresses and asked for invitations to go out. Up to 50 addresses per call. Addresses the link's allow or block list would turn away are not sent to and are listed in the result. Inviting an address again sends a new email and stops its earlier personal link working.",
    scope: "share",
    openWorld: true,
    input: {
      linkId: id("sharing link"),
      emails: z.array(z.string().max(320)).min(1).max(50),
      expiresInDays: z.number().int().min(1).max(3650).optional().describe("Days until these personal links stop working. Omit for no expiry."),
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const link = await requireLink(p, v, a.linkId, true);
      if (link.isArchived)
        throw new ToolError(
          `The link "${link.name}" is archived, so invitations to it would not work. Switch it on with update_sharing_link first.`
        );
      if (link.expiresAt && link.expiresAt <= new Date())
        throw new ToolError(`The link "${link.name}" has expired. Extend it with update_sharing_link first.`);

      const invalid: string[] = [];
      const turnedAway: { email: string; reason: string }[] = [];
      const emails: string[] = [];
      for (const raw of a.emails) {
        const parsed = parseAddress(raw);
        if (!parsed) {
          invalid.push(clean(raw).slice(0, 80));
          continue;
        }
        if (emails.includes(parsed.email)) continue;
        const check = isEmailAllowed(link, parsed.email);
        if (!check.allowed)
          turnedAway.push({
            email: parsed.email,
            reason: link.blockList.some((b) => parsed.email === b || parsed.email.endsWith(b.startsWith("@") ? b : `@${b}`))
              ? "On this link's block list. Remove it with update_sharing_link if the user wants them in."
              : `Not on this link's allow list (${link.allowList.join(", ")}). Add the address or its domain with update_sharing_link if the user wants them in.`,
          });
        else emails.push(parsed.email);
      }

      const { sendLinkInvite } = await import("@/lib/email");
      const expiresAt = expiryFrom(a.expiresInDays);
      const already = new Set(
        (
          await db.linkRecipient.findMany({
            where: { linkId: link.id, email: { in: emails } },
            select: { email: true },
          })
        ).map((r) => r.email)
      );
      const sent: { email: string; previouslyInvited: boolean }[] = [];
      const failed: string[] = [];
      const overLimit: string[] = [];
      for (const email of emails) {
        // 200 invitations an hour per person, counted per address.
        if (!rateLimit(`mcp-invite:${limitKey(p)}`, 200, 3_600_000).ok) {
          overLimit.push(email);
          continue;
        }
        const token = randomToken(24);
        try {
          await db.linkRecipient.upsert({
            where: { linkId_email: { linkId: link.id, email } },
            update: { token, expiresAt, lastSentAt: new Date() },
            create: { linkId: link.id, email, token, expiresAt },
          });
          await sendLinkInvite({
            email,
            url: link.domain
              ? `https://${link.domain.domain}/t/${token}`
              : `${appOrigin()}/view/t/${token}`,
            itemName: link.document?.name ?? link.dataroom?.name ?? link.name,
            teamName: link.team.name,
            expiresAt,
          });
          sent.push({ email, previouslyInvited: already.has(email) });
        } catch (e) {
          console.error("[mcp] invite failed", e);
          failed.push(email);
        }
      }
      return {
        data: {
          link: { linkId: link.id, name: link.name },
          sent,
          ...(turnedAway.length ? { notSentLinkWouldTurnThemAway: turnedAway } : {}),
          ...(invalid.length ? { notValidAddresses: invalid } : {}),
          ...(failed.length ? { failedToSend: failed } : {}),
          ...(overLimit.length ? { notSentHourlyLimitReached: overLimit } : {}),
        },
        audit: sent.length
          ? `Emailed ${sent.length} invitation(s) to sharing link "${link.name}": ${sent.map((s) => s.email).join(", ")}`
          : undefined,
      };
    },
  });

  defineTool(server, {
    name: "revoke_invitations",
    title: "Withdraw invitations",
    description:
      "Withdraw personal invitations to a sharing link: the personal links in those people's emails stop working at once. It does not block them from the sharing link's ordinary URL; for that, change the link's allow or block list with update_sharing_link. get_sharing_link_visits lists who has been invited.",
    scope: "share",
    destructive: true,
    idempotent: true,
    input: {
      linkId: id("sharing link"),
      emails: z.array(z.string().max(320)).min(1).max(50),
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const link = await requireLink(p, v, a.linkId, true);
      const emails = a.emails.map((e) => parseAddress(e)?.email).filter((e): e is string => !!e);
      const found = await db.linkRecipient.findMany({
        where: { linkId: link.id, email: { in: emails } },
        select: { id: true, email: true },
      });
      await db.linkRecipient.deleteMany({ where: { id: { in: found.map((f) => f.id) } } });
      const revoked = found.map((f) => f.email);
      return {
        data: {
          link: { linkId: link.id, name: link.name },
          revoked,
          notInvited: a.emails.filter((e) => !revoked.includes(parseAddress(e)?.email ?? "")),
        },
        audit: revoked.length
          ? `Withdrew ${revoked.length} invitation(s) to sharing link "${link.name}": ${revoked.join(", ")}`
          : undefined,
      };
    },
  });

  // ---------- permanent deletion ----------

  const CONFIRM =
    "Call it first without the confirmation: nothing is deleted and the result lists exactly what would be lost. Show that to the user. Only after they say yes, call again with the confirmation the first call gave you.";

  /** Ties a confirmation to the exact set previewed, as it was then. */
  const tokenFor = (teamId: string, docs: { id: string; name: string }[]) =>
    createHash("sha256")
      .update([teamId, ...docs.map((d) => `${d.id}:${d.name}`).sort()].join("|"))
      .digest("hex")
      .slice(0, 12);

  defineTool(server, {
    name: "delete_documents",
    title: "Delete documents permanently",
    description: `Permanently delete up to 50 documents from the library and from every data room, with all their versions, their sharing links and their view history. This cannot be undone. To only take documents out of a room, use remove_from_dataroom instead. ${CONFIRM}`,
    scope: "delete",
    destructive: true,
    input: {
      documentIds: z.array(id("document")).min(1).max(50),
      confirmToken: z
        .string()
        .max(40)
        .optional()
        .describe("The confirmToken from the preview call, given only after the user has confirmed."),
    },
    handler: async (p, a) => {
      const v = await visibilityFor(p);
      const ids = [...new Set(a.documentIds)];
      for (const documentId of ids) await requireDoc(p, v, documentId, "delete");
      const extFilter = externalViews(await teamMemberEmails(p.teamId));
      const docs = await db.document.findMany({
        where: { id: { in: ids }, teamId: p.teamId },
        include: {
          dataroomDocs: {
            where: { dataroom: v.room },
            include: {
              dataroom: {
                select: { name: true, _count: { select: { links: { where: liveLink() } } } },
              },
            },
          },
          _count: { select: { links: true, versions: true, views: { where: extFilter } } },
        },
        orderBy: { name: "asc" },
      });
      const wouldDelete = docs.map((doc) => ({
        documentId: doc.id,
        name: doc.name,
        versions: doc._count.versions,
        removedFromDatarooms: doc.dataroomDocs.map((d) => d.dataroom.name),
        visibleToVisitorsThroughRooms: doc.dataroomDocs
          .filter((d) => d.dataroom._count.links > 0)
          .map((d) => d.dataroom.name),
        directSharingLinksDeleted: doc._count.links,
        visitsLost: doc._count.views,
      }));
      const token = tokenFor(p.teamId, docs);
      if (a.confirmToken === undefined)
        return {
          data: {
            deleted: false,
            wouldDelete,
            confirmToken: token,
            next: "Nothing was deleted. Show this list to the user. Only if they confirm, call delete_documents again with the same documentIds and this confirmToken.",
          },
        };
      if (a.confirmToken !== token)
        throw new ToolError(
          "Not deleted: the confirmToken does not match these documents as they are now. Call delete_documents without confirmToken to preview this exact set again, show it to the user, then use the new token."
        );
      await db.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) }, teamId: p.teamId } });
      return {
        data: { deleted: true, documents: wouldDelete },
        audit: `Permanently deleted ${docs.length} document(s): ${docs.slice(0, 20).map((d) => `"${d.name}"`).join(", ")}${docs.length > 20 ? ` and ${docs.length - 20} more` : ""}`,
      };
    },
  });

  defineTool(server, {
    name: "delete_dataroom",
    title: "Delete data room permanently",
    description:
      "Permanently delete a data room with its folders, its sharing links, their invitations and its visit history. The documents themselves stay in the library. This cannot be undone. Call it first without confirmName: nothing is deleted and the result lists exactly what would be lost. Show that to the user. Only after they say yes, call again with confirmName set to the room's exact name.",
    scope: "delete",
    destructive: true,
    input: {
      dataroomId: id("data room"),
      confirmName: z.string().max(400).optional().describe("The room's exact name, given only after the user has confirmed."),
    },
    handler: async (p, a) => {
      const room = await requireRoom(p, a.dataroomId, "MANAGE");
      const extFilter = externalViews(await teamMemberEmails(p.teamId));
      const [invitations, documents, folders, links, visits] = await Promise.all([
        db.linkRecipient.count({ where: { link: { dataroomId: room.id } } }),
        db.dataroomDocument.count({ where: { dataroomId: room.id } }),
        db.dataroomFolder.count({ where: { dataroomId: room.id } }),
        db.link.count({ where: { dataroomId: room.id } }),
        db.view.count({ where: { dataroomId: room.id, ...extFilter } }),
      ]);
      const wouldDelete = {
        dataroom: room.name,
        foldersDeleted: folders,
        documentsKeptInLibrary: documents,
        sharingLinksDeleted: links,
        invitationsWithdrawn: invitations,
        visitsLost: visits,
      };
      if (a.confirmName === undefined)
        return {
          data: {
            deleted: false,
            wouldDelete,
            next: `Nothing was deleted. Show this to the user. Only if they confirm, call delete_dataroom again with confirmName "${room.name}".`,
          },
        };
      if (clean(a.confirmName) !== clean(room.name))
        throw new ToolError(
          `Not deleted: confirmName "${clean(a.confirmName).slice(0, 80)}" does not match the room's name, "${room.name}". Check with the user that this is the room they mean.`
        );
      await db.dataroom.delete({ where: { id: room.id } });
      return {
        data: { deleted: true, ...wouldDelete },
        audit: `Permanently deleted data room "${room.name}" (${links} link(s), ${visits} visit(s))`,
      };
    },
  });
}
