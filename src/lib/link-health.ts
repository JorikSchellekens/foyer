import "server-only";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { s3, BUCKET } from "@/lib/storage";
import { fetchNotionPage } from "@/lib/notion";
import { appUrl, sendHealthAlert } from "@/lib/email";

// While a problem stays open, re-send it at most this often
const REMIND_EVERY = 24 * 3600_000;

type Problem = { key: string; summary: string };

type CheckedDoc = {
  id: string;
  name: string;
  type: string;
  externalUrl: string | null;
  currentVersion: { fileKey: string | null } | null;
};

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicUrl(link: { slug: string; domain: { domain: string } | null }) {
  return link.domain
    ? `https://${link.domain.domain}/${link.slug}`
    : appUrl(`/view/${link.slug}`);
}

/**
 * Why a document would render empty for viewers, or null when it is fine.
 * Throws when storage itself cannot be reached, so one outage is reported
 * once instead of once per file.
 */
async function documentProblem(doc: CheckedDoc): Promise<string | null> {
  if (doc.type === "NOTION") {
    if (!doc.externalUrl) return "Notion document has no URL";
    const recordMap = await fetchNotionPage(doc.externalUrl);
    if (!recordMap || Object.keys(recordMap.block).length === 0)
      return "Notion page could not be fetched";
    return null;
  }
  const key = doc.currentVersion?.fileKey;
  if (!key) return "no file uploaded";
  try {
    await s3().send(new HeadObjectCommand({ Bucket: BUCKET(), Key: key }));
    return null;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) return "file is missing from storage";
    throw err;
  }
}

async function siteProblem(): Promise<string | null> {
  const url = appUrl("/api/health");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return res.ok ? null : `${url} returned HTTP ${res.status}`;
  } catch (err) {
    return `${url} is unreachable: ${(err as Error).message}`;
  }
}

/** Every document reachable through a live link must have viewable content. */
export async function findProblems(): Promise<Problem[]> {
  const now = new Date();
  const docSelect = {
    id: true,
    name: true,
    type: true,
    externalUrl: true,
    currentVersion: { select: { fileKey: true } },
  } as const;
  const links = await db.link.findMany({
    where: {
      isArchived: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      name: true,
      slug: true,
      domain: { select: { domain: true } },
      document: { select: docSelect },
      dataroom: {
        select: { documents: { select: { document: { select: docSelect } } } },
      },
    },
  });

  // Check each document once, however many links share it
  const docs = new Map<string, { doc: CheckedDoc; links: string[] }>();
  for (const link of links) {
    const label = `${link.name} (${publicUrl(link)})`;
    const linked = link.document
      ? [link.document]
      : (link.dataroom?.documents.map((d) => d.document) ?? []);
    for (const doc of linked) {
      const entry = docs.get(doc.id) ?? { doc, links: [] };
      entry.links.push(label);
      docs.set(doc.id, entry);
    }
  }

  const problems: Problem[] = [];
  const site = await siteProblem();
  if (site) problems.push({ key: "site", summary: `Site health check failed: ${site}` });

  let storageError: string | null = null;
  for (const { doc, links: labels } of docs.values()) {
    if (storageError && doc.type !== "NOTION") continue;
    try {
      const problem = await documentProblem(doc);
      if (problem)
        problems.push({
          key: `doc:${doc.id}`,
          summary: `"${doc.name}": ${problem}. Shared on: ${labels.join(", ")}`,
        });
    } catch (err) {
      storageError = (err as Error).message;
    }
  }
  if (storageError)
    problems.push({
      key: "storage",
      summary: `File storage is unreachable: ${storageError}`,
    });
  return problems;
}

function recipients(): string[] {
  return (process.env.LINK_HEALTH_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function list(items: string[]) {
  return `<ul style="padding-left:18px;margin:6px 0 16px;">${items
    .map((s) => `<li style="margin-bottom:6px;">${esc(s)}</li>`)
    .join("")}</ul>`;
}

/**
 * Compare this run's problems with the open ones and email when something
 * breaks, recovers, or has stayed broken for a day. State is only saved
 * after the email is sent, so a failed send is retried on the next run.
 */
export async function runLinkHealthCheck() {
  const current = await findProblems();
  const open = await db.healthIssue.findMany();
  const openKeys = new Set(open.map((i) => i.key));
  const currentKeys = new Set(current.map((p) => p.key));
  const now = Date.now();

  const added = current.filter((p) => !openKeys.has(p.key));
  const resolved = open.filter((i) => !currentKeys.has(i.key));
  const ongoing = current.filter((p) => openKeys.has(p.key));
  const due = open.some(
    (i) => currentKeys.has(i.key) && now - i.lastNotifiedAt.getTime() >= REMIND_EVERY
  );
  const notify = added.length > 0 || resolved.length > 0 || due;

  const to = recipients();
  let sent = 0;
  if (notify && to.length > 0) {
    const sections: string[] = [];
    if (added.length) sections.push(`<strong>New problems</strong>${list(added.map((p) => p.summary))}`);
    if (ongoing.length) sections.push(`<strong>Still broken</strong>${list(ongoing.map((p) => p.summary))}`);
    if (resolved.length) sections.push(`<strong>Resolved</strong>${list(resolved.map((i) => i.summary))}`);
    const subject = current.length
      ? `Foyer: ${current.length} link health problem${current.length === 1 ? "" : "s"}`
      : "Foyer: all links healthy again";
    for (const addr of to) {
      const res = await sendHealthAlert({
        to: addr,
        subject,
        heading: subject.replace(/^Foyer: /, "").replace(/^./, (c) => c.toUpperCase()),
        body: sections.join(""),
      });
      if (res.ok) sent++;
    }
    if (sent === 0) {
      return { ok: false as const, problems: current.length, error: "no alert email could be sent" };
    }
  }

  const stamp = new Date(now);
  await db.$transaction([
    db.healthIssue.deleteMany({ where: { key: { in: resolved.map((i) => i.key) } } }),
    ...current.map((p) =>
      db.healthIssue.upsert({
        where: { key: p.key },
        create: { key: p.key, summary: p.summary, firstSeenAt: stamp, lastNotifiedAt: stamp },
        update: notify && sent > 0 ? { summary: p.summary, lastNotifiedAt: stamp } : { summary: p.summary },
      })
    ),
  ]);

  return {
    ok: true as const,
    problems: current.length,
    added: added.length,
    resolved: resolved.length,
    emailed: sent,
  };
}
