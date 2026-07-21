import "server-only";
import { Resend } from "resend";

const FROM = () => process.env.EMAIL_FROM ?? "Foyer <onboarding@resend.dev>";

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export function appUrl(path = "") {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

/** Shared shell: quiet, typographic, no images so it never trips spam filters. */
function shell(opts: { heading: string; body: string; footer?: string }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafaf8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;padding:48px 16px;">
<tr><td align="center">
<table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;">
<tr><td style="padding-bottom:28px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:26px;height:26px;background:#175b47;border-radius:6px;text-align:center;vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#fafaf8;line-height:26px;">&#8745;</td>
<td style="padding-left:9px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:22px;color:#16181d;">Foyer</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e7e6e0;border-radius:10px;padding:36px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.35;color:#16181d;padding-bottom:14px;">${opts.heading}</div>
<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#454a51;">${opts.body}</div>
</td></tr>
<tr><td style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a8d93;padding-top:20px;">${
    opts.footer ?? "If you were not expecting this email, you can safely ignore it."
  }</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="background:#175b47;border-radius:7px;">
<a href="${href}" style="display:inline-block;padding:11px 22px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;">${label}</a>
</td></tr></table>
<div style="font-size:12px;color:#8a8d93;word-break:break-all;">Or paste this link into your browser:<br/>${href}</div>`;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  const resend = client();
  if (!resend) {
    console.log(`[email:dev] to=${opts.to} subject="${opts.subject}"`);
    const m = opts.html.match(/href="([^"]+)"/);
    if (m) console.log(`[email:dev] link: ${m[1]}`);
    return { ok: true, dev: true };
  }
  const res = await resend.emails.send({
    from: FROM(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (res.error) {
    console.error("resend error", res.error);
    return { ok: false as const, error: res.error.message };
  }
  return { ok: true as const };
}

export async function sendMagicLink(email: string, href: string) {
  return sendEmail({
    to: email,
    subject: "Your sign-in link",
    html: shell({
      heading: "Sign in to Foyer",
      body: `Click the button below to sign in. This link expires in 30 minutes and can be used once.${button(
        href,
        "Sign in"
      )}`,
    }),
  });
}

export async function sendViewerVerification(
  email: string,
  href: string,
  documentName: string
) {
  return sendEmail({
    to: email,
    subject: `Verify your email to view ${documentName}`,
    html: shell({
      heading: "Verify your email",
      body: `You requested access to <strong>${documentName}</strong>. Confirm this is your email address to continue.${button(
        href,
        "Verify and view"
      )}`,
    }),
  });
}

export async function sendLinkInvite(opts: {
  email: string;
  url: string;
  itemName: string;
  teamName: string;
  expiresAt?: Date | null;
}) {
  const expiry = opts.expiresAt
    ? `<br/><br/>This invitation expires on ${opts.expiresAt.toLocaleDateString(
        "en-GB",
        { day: "numeric", month: "long", year: "numeric" }
      )}.`
    : "";
  return sendEmail({
    to: opts.email,
    subject: `${opts.teamName} shared "${opts.itemName}" with you`,
    html: shell({
      heading: `${opts.teamName} shared a document with you`,
      body: `You have been invited to view <strong>${opts.itemName}</strong>.${button(
        opts.url,
        "Open document"
      )}${expiry}`,
    }),
  });
}

export async function sendTeamInvite(opts: {
  email: string;
  inviteUrl: string;
  teamName: string;
  inviterName: string;
}) {
  const href = opts.inviteUrl;
  return sendEmail({
    to: opts.email,
    subject: `Join ${opts.teamName} on Foyer`,
    html: shell({
      heading: `${opts.inviterName} invited you to ${opts.teamName}`,
      body: `Accept the invitation to start sharing documents with your team.${button(
        href,
        "Accept invitation"
      )}`,
    }),
  });
}

export async function sendActivityEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
}) {
  return sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: shell({
      heading: opts.heading,
      body: `${opts.body}${
        opts.ctaUrl ? button(opts.ctaUrl, opts.ctaLabel ?? "View activity") : ""
      }`,
      footer: "You are receiving this because notifications are enabled for your team. Manage them in Settings → Notifications.",
    }),
  });
}
