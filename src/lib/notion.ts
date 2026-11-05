import "server-only";
import type { ExtendedRecordMap } from "notion-types";

/**
 * Freshness. A full page load from Notion takes ~0.2-1.5 s, so pages are kept
 * in memory. Edits must still show up quickly, so instead of a flat TTL:
 *
 * - After RECHECK_MS, the next request asks Notion for the page block alone
 *   (~0.2 s) and compares its version + last_edited_time with the cached
 *   copy. Unchanged: keep serving the cache. Changed: load the page again.
 * - After MAX_AGE_MS the page is reloaded regardless. Edits that never touch
 *   the page block (a sub-page, a synced block, a linked database) land
 *   within that window, and Notion's signed file URLs (PDFs, images; they
 *   expire within hours) never go stale.
 * - Callers can ask for a fresh copy (the internal preview), which also
 *   refreshes the cache for visitors.
 * - If Notion is unreachable, the last good copy is served rather than an
 *   empty page.
 */
type Entry = {
  recordMap: ExtendedRecordMap;
  stamp: string | null;
  fetchedAt: number;
  checkedAt: number;
};
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry | null>>();
const RECHECK_MS = 15_000;
const MAX_AGE_MS = 5 * 60_000;

export function notionPageId(url: string): string | null {
  const m = url.match(/[a-f0-9]{32}/i);
  if (m) return m[0];
  const dash = url.match(
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
  );
  return dash ? dash[0].replace(/-/g, "") : null;
}

/**
 * Validate a public Notion URL and derive a readable title from its slug.
 * Returns the normalized url + name, or a user-facing error message.
 */
export function parseNotionUrl(
  input: string
): { url: string; name: string } | { error: string } {
  const url = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "Enter a valid Notion URL." };
  }
  if (
    !parsed.hostname.endsWith("notion.site") &&
    !parsed.hostname.endsWith("notion.so")
  )
    return {
      error: "Only public notion.site or notion.so links are supported.",
    };
  if (!notionPageId(url))
    return { error: "That link doesn't point to a specific Notion page." };

  const name = decodeURIComponent(
    parsed.pathname.split("/").filter(Boolean).pop() ?? "Notion page"
  )
    .replace(/-[a-f0-9]{32}$/i, "")
    .replace(/-/g, " ")
    .trim();
  return { url, name: name || "Notion page" };
}

async function notionApi() {
  const { NotionAPI } = await import("notion-client");
  // Notion's Cloudflare rejects Node fetch's default "node" user-agent
  // with a 403 bot page; any other UA is let through
  return new NotionAPI({
    ofetchOptions: { headers: { "user-agent": "Foyer (+https://data.boop.it)" } },
  });
}

function dashed(id: string) {
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** version + last_edited_time of a page block, the change signal. */
function stampOf(block: unknown): string | null {
  const b = block as
    | { value?: { value?: Record<string, unknown> } & Record<string, unknown> }
    | undefined;
  const v = (b?.value?.value ?? b?.value) as
    | { version?: number; last_edited_time?: number }
    | undefined;
  if (!v || (v.version == null && v.last_edited_time == null)) return null;
  return `${v.version ?? ""}:${v.last_edited_time ?? ""}`;
}

/** The page block alone: one small request, ~0.2 s. */
async function currentStamp(pageId: string): Promise<string | null> {
  const api = await notionApi();
  const id = dashed(pageId);
  const res = await api.getBlocks([id]);
  return stampOf(res?.recordMap?.block?.[id]);
}

function load(pageId: string): Promise<Entry | null> {
  const running = inflight.get(pageId);
  if (running) return running;
  const p = (async () => {
    try {
      const api = await notionApi();
      const recordMap = await api.getPage(pageId);
      const now = Date.now();
      const entry: Entry = {
        recordMap,
        stamp:
          stampOf(recordMap.block[dashed(pageId)]) ??
          stampOf(recordMap.block[pageId]),
        fetchedAt: now,
        checkedAt: now,
      };
      cache.set(pageId, entry);
      return entry;
    } catch (err) {
      console.error(`[notion] failed to fetch page ${pageId}:`, err);
      return null;
    } finally {
      inflight.delete(pageId);
    }
  })();
  inflight.set(pageId, p);
  return p;
}

export async function fetchNotionPage(
  url: string,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<ExtendedRecordMap | null> {
  const pageId = notionPageId(url);
  if (!pageId) return null;
  const hit = cache.get(pageId);
  const now = Date.now();

  if (hit && !fresh && now - hit.fetchedAt < MAX_AGE_MS) {
    if (now - hit.checkedAt < RECHECK_MS) return hit.recordMap;
    let stamp: string | null = null;
    try {
      stamp = await currentStamp(pageId);
    } catch (err) {
      // Notion unreachable: what we have beats an empty page.
      console.error(`[notion] change check failed for ${pageId}:`, err);
      return hit.recordMap;
    }
    if (stamp && stamp === hit.stamp) {
      hit.checkedAt = now;
      return hit.recordMap;
    }
  }

  const entry = await load(pageId);
  return entry?.recordMap ?? hit?.recordMap ?? null;
}
