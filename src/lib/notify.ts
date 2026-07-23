import "server-only";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { sendActivityEmail, appUrl } from "@/lib/email";

export type NotificationKey =
  | "document_viewed"
  | "dataroom_visited"
  | "file_uploaded"
  | "new_question"
  | "blocked_access"
  | "access_requested"
  | "signature_signed"
  | "signature_completed"
  | "signature_declined";

const NOTIFICATION_META: Record<
  NotificationKey,
  { subject: (p: Payload) => string; heading: (p: Payload) => string; body: (p: Payload) => string }
> = {
  document_viewed: {
    subject: (p) => `${p.who ?? "Someone"} viewed ${p.itemName}`,
    heading: (p) => `Your document was viewed`,
    body: (p) =>
      `<strong>${p.who ?? "An anonymous visitor"}</strong> opened <strong>${p.itemName}</strong> via the link "${p.linkName}".`,
  },
  dataroom_visited: {
    subject: (p) => `${p.who ?? "Someone"} visited ${p.itemName}`,
    heading: () => `Your data room was visited`,
    body: (p) =>
      `<strong>${p.who ?? "An anonymous visitor"}</strong> entered <strong>${p.itemName}</strong> via the link "${p.linkName}".`,
  },
  file_uploaded: {
    subject: (p) => `New file in ${p.itemName}`,
    heading: () => `A file was uploaded`,
    body: (p) => `A new file was uploaded to <strong>${p.itemName}</strong>.`,
  },
  new_question: {
    subject: (p) => `New question in ${p.itemName}`,
    heading: () => `A visitor asked a question`,
    body: (p) =>
      `<strong>${p.who ?? "A visitor"}</strong> asked a question in <strong>${p.itemName}</strong>:<br/><br/><em>${p.detail ?? ""}</em>`,
  },
  blocked_access: {
    subject: (p) => `Blocked access attempt on ${p.linkName}`,
    heading: () => `An access attempt was blocked`,
    body: (p) =>
      `<strong>${p.who ?? "A visitor"}</strong> was denied access to the link "${p.linkName}"${p.detail ? ` (${p.detail})` : ""}.`,
  },
  access_requested: {
    subject: (p) => `${p.who ?? "Someone"} requested access to ${p.linkName}`,
    heading: () => `Someone requested access`,
    body: (p) =>
      `<strong>${p.who ?? "A visitor"}</strong> asked for access to the link "${p.linkName}"${p.detail ? `:<br/><br/><em>${p.detail}</em>` : "."} Grant or dismiss it from your dashboard.`,
  },
  signature_signed: {
    subject: (p) => `${p.who ?? "A signer"} signed ${p.itemName}`,
    heading: () => `A signer has signed`,
    body: (p) =>
      `<strong>${p.who ?? "A signer"}</strong> signed <strong>${p.itemName}</strong>${p.detail ? ` (${p.detail})` : ""}.`,
  },
  signature_completed: {
    subject: (p) => `Completed: ${p.itemName} is fully signed`,
    heading: () => `A signature request completed`,
    body: (p) =>
      `All parties have signed <strong>${p.itemName}</strong>. The final document and its certificate of completion are ready.`,
  },
  signature_declined: {
    subject: (p) => `${p.who ?? "A signer"} declined to sign ${p.itemName}`,
    heading: () => `A signer declined`,
    body: (p) =>
      `<strong>${p.who ?? "A signer"}</strong> declined to sign <strong>${p.itemName}</strong>${p.detail ? `:<br/><br/><em>${p.detail}</em>` : "."}`,
  },
};

type Payload = {
  who?: string | null;
  itemName?: string;
  linkName?: string;
  detail?: string;
  href?: string;
};

/** Record in-app notification, email opted-in members, dispatch webhooks. */
export async function notifyTeam(
  teamId: string,
  key: NotificationKey,
  payload: Payload
) {
  await db.notification.create({
    data: { teamId, type: key, payload: payload as object },
  });

  const members = await db.teamMember.findMany({
    where: { teamId },
    include: { user: true },
  });
  const prefs = await db.notificationPreference.findMany({
    where: { teamId, key },
  });
  const meta = NOTIFICATION_META[key];
  await Promise.allSettled(
    members
      .filter((m) => prefs.find((p) => p.userId === m.userId)?.email ?? true)
      .map((m) =>
        sendActivityEmail({
          to: m.user.email,
          subject: meta.subject(payload),
          heading: meta.heading(payload),
          body: meta.body(payload),
          ctaUrl: payload.href ? appUrl(payload.href) : undefined,
        })
      )
  );

  await dispatchWebhooks(teamId, key.replace("_", "."), payload);
}

export async function dispatchWebhooks(
  teamId: string,
  event: string,
  data: unknown
) {
  const hooks = await db.webhook.findMany({
    where: { teamId, active: true },
  });
  const matching = hooks.filter(
    (h) => h.events.length === 0 || h.events.includes(event)
  );
  await Promise.allSettled(
    matching.map(async (hook) => {
      const body = JSON.stringify({
        event,
        createdAt: new Date().toISOString(),
        data,
      });
      const signature = createHmac("sha256", hook.secret)
        .update(body)
        .digest("hex");
      let statusCode: number | null = null;
      let error: string | null = null;
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-foyer-event": event,
            "x-foyer-signature": `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = res.status;
      } catch (e) {
        error = e instanceof Error ? e.message : "request failed";
      }
      await db.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          event,
          payload: JSON.parse(body),
          statusCode,
          error,
        },
      });
    })
  );
}
