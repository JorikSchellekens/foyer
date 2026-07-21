import "server-only";
import { db } from "@/lib/db";
import { hotLeads } from "@/lib/analytics";
import { formatDuration } from "@/lib/format";
import { externalViews, teamMemberEmails } from "@/lib/internal-views";
import { sendActivityEmail, appUrl } from "@/lib/email";

/**
 * A weekly activity digest for one team, or null when nothing happened in the
 * window (so we never send an empty email).
 */
export async function buildTeamDigest(
  teamId: string,
  teamName: string
): Promise<{ subject: string; heading: string; body: string } | null> {
  const since = new Date(Date.now() - 7 * 86400_000);
  const extFilter = externalViews(await teamMemberEmails(teamId));

  const views = await db.view.findMany({
    where: { link: { teamId }, startedAt: { gt: since }, ...extFilter },
    select: { viewerEmail: true, totalDuration: true },
  });
  if (views.length === 0) return null;

  const uniqueVisitors = new Set(
    views.map((v) => v.viewerEmail).filter(Boolean)
  ).size;
  const totalTime = views.reduce((s, v) => s + v.totalDuration, 0);
  const leads = await hotLeads(teamId, { days: 7, limit: 3 });

  const stats = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
      <tr>
        <td style="padding-right:24px;"><strong style="font-size:20px;color:#16181d;">${views.length}</strong><br/><span style="color:#8a8d93;font-size:12px;">visits</span></td>
        <td style="padding-right:24px;"><strong style="font-size:20px;color:#16181d;">${uniqueVisitors}</strong><br/><span style="color:#8a8d93;font-size:12px;">visitors</span></td>
        <td><strong style="font-size:20px;color:#16181d;">${formatDuration(totalTime)}</strong><br/><span style="color:#8a8d93;font-size:12px;">time read</span></td>
      </tr>
    </table>`;

  const leadsHtml = leads.length
    ? `<p style="margin:20px 0 6px;color:#16181d;"><strong>Worth following up</strong></p>` +
      leads
        .map(
          (l) =>
            `<div style="padding:6px 0;border-top:1px solid #e7e6e0;"><strong>${l.email}</strong><br/><span style="color:#8a8d93;font-size:13px;">${l.reason}</span></div>`
        )
        .join("")
    : "";

  return {
    subject: `${teamName}: ${views.length} visits this week`,
    heading: "Your week on Foyer",
    body: `<p style="margin:0 0 6px;">Here is what happened across your links in the last 7 days.</p>${stats}${leadsHtml}`,
  };
}

/** Send the weekly digest to every member who opted in, across all teams. */
export async function sendWeeklyDigests(): Promise<{ sent: number }> {
  const prefs = await db.notificationPreference.findMany({
    where: { key: "weekly_digest", email: true },
    include: { user: { select: { email: true } }, team: { select: { id: true, name: true } } },
  });

  // Build each team's digest once, then fan out to its opted-in members.
  const digestByTeam = new Map<
    string,
    { subject: string; heading: string; body: string } | null
  >();
  let sent = 0;

  for (const pref of prefs) {
    if (!digestByTeam.has(pref.teamId)) {
      digestByTeam.set(
        pref.teamId,
        await buildTeamDigest(pref.teamId, pref.team.name)
      );
    }
    const digest = digestByTeam.get(pref.teamId);
    if (!digest) continue;
    await sendActivityEmail({
      to: pref.user.email,
      subject: digest.subject,
      heading: digest.heading,
      body: digest.body,
      ctaUrl: appUrl("/dashboard"),
      ctaLabel: "Open dashboard",
    });
    sent += 1;
  }
  return { sent };
}
