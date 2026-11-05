/**
 * Link documents: a library entry that is only an external URL. Visitors see
 * it alongside every other document; opening it records the view and sends
 * them to the URL.
 */

/**
 * Validate a URL for a link document and pick a default name. Only http(s)
 * is accepted, so a stored URL can never become a javascript: or data: href.
 */
export function parseExternalUrl(
  input: string,
  nameInput?: string
): { url: string; name: string } | { error: string } {
  let raw = input.trim();
  if (!raw) return { error: "Enter a URL." };
  // "example.com/deck" is what people paste; assume https
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: "Enter a valid URL, like https://example.com/page." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return { error: "Only http and https links are supported." };
  if (!parsed.hostname.includes("."))
    return { error: "Enter a full web address, like https://example.com." };

  const given = nameInput?.trim();
  const host = parsed.hostname.replace(/^www\./, "");
  const path = decodeURIComponent(parsed.pathname).replace(/\/+$/, "");
  const fallback = path ? `${host}${path}` : host;
  return {
    url: parsed.toString(),
    name: (given || fallback).slice(0, 200),
  };
}
