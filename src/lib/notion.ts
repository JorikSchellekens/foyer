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
