import "server-only";
import type { ExtendedRecordMap } from "notion-types";

const cache = new Map<string, { at: number; recordMap: ExtendedRecordMap }>();
const TTL = 5 * 60_000;

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

export async function fetchNotionPage(
  url: string
): Promise<ExtendedRecordMap | null> {
  const pageId = notionPageId(url);
  if (!pageId) return null;
  const hit = cache.get(pageId);
  if (hit && Date.now() - hit.at < TTL) return hit.recordMap;
  try {
    const { NotionAPI } = await import("notion-client");
    const api = new NotionAPI();
    const recordMap = await api.getPage(pageId);
    cache.set(pageId, { at: Date.now(), recordMap });
    return recordMap;
  } catch {
    return null;
  }
}
