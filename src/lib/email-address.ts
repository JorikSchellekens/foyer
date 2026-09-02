// Parsing of pasted email addresses in the forms people actually paste them:
//   nick@ebar.co.uk
//   Nick Beeson <nick@ebar.co.uk>
//   "Beeson, Nick" <nick@ebar.co.uk>
//   <nick@ebar.co.uk>
//   mailto:nick@ebar.co.uk
// plus lists of those separated by commas, semicolons or newlines. A display
// name, when present, is returned so it can seed the recipient's name.
// Client-safe: no server imports.

export type ParsedAddress = { email: string; name: string | null };

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function parseAddress(raw: string): ParsedAddress | null {
  let s = raw.trim();
  if (!s) return null;
  let name: string | null = null;

  const angle = s.match(/^(.*?)<([^<>]*)>\s*$/);
  if (angle) {
    name = angle[1].trim();
    s = angle[2].trim();
  }
  s = s.replace(/^mailto:/i, "");
  // Unquote and unescape a quoted display name.
  if (name) {
    const q = name.match(/^"(.*)"$/);
    if (q) name = q[1].replace(/\\(.)/g, "$1");
    name = name.trim();
  }
  const email = s.toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  // A "name" that is just the address again carries no information.
  if (name && name.toLowerCase() === email) name = null;
  return { email, name: name || null };
}

/**
 * Split a pasted list into addresses. Separators inside quotes or angle
 * brackets are part of the token ("Beeson, Nick" <n@x>), everywhere else
 * they split. Order is preserved; duplicates keep the first occurrence.
 */
export function parseAddressList(raw: string): {
  addresses: ParsedAddress[];
  invalid: string[];
} {
  const tokens: string[] = [];
  let cur = "";
  let inQuote = false;
  let inAngle = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"' && !inAngle) {
      // an escaped quote inside a quoted name stays literal
      if (!(inQuote && raw[i - 1] === "\\")) inQuote = !inQuote;
      cur += c;
      continue;
    }
    if (c === "<" && !inQuote) inAngle = true;
    if (c === ">" && !inQuote) inAngle = false;
    if (!inQuote && !inAngle && (c === "," || c === ";" || c === "\n" || c === "\r")) {
      tokens.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  tokens.push(cur);

  const addresses: ParsedAddress[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    const parsed = parseAddress(trimmed);
    if (!parsed) {
      invalid.push(trimmed);
      continue;
    }
    if (seen.has(parsed.email)) continue;
    seen.add(parsed.email);
    addresses.push(parsed);
  }
  return { addresses, invalid };
}
