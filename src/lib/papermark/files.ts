import "server-only";

/**
 * Getting file bytes out of Papermark.
 *
 * Papermark's public API deliberately exposes no file content: `Document.url`
 * is null for real files and there is no download endpoint. So the bytes have
 * to come from somewhere else, and there are exactly two honest options.
 *
 * 1. SESSION - the owner pastes their Papermark dashboard session cookie and
 *    we call the same internal endpoint their browser calls. This is the
 *    user's own data from their own account, it returns the *original* upload
 *    (not a converted rendition), it is not rate limited, and it records no
 *    views.
 *
 * 2. MANUAL - the user bulk-downloads from Papermark themselves and hands us
 *    the files; we match them to the scanned inventory by name. Always works,
 *    needs no credentials, costs the user a few minutes.
 *
 * A third route exists and is deliberately NOT implemented: creating a public
 * download link per document and scraping the viewer. It would fabricate a
 * view record against every document (corrupting the analytics the user is
 * migrating), depends on a browser-fingerprint hash of request headers, and
 * expires 30 minutes after each view. It fails quietly and dirties the data it
 * touches, which is the wrong trade for a one-off migration.
 */

export const PAPERMARK_APP = "https://app.papermark.com";

export type PmTeam = { id: string; name: string };

export class PapermarkSessionError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "PapermarkSessionError";
  }
}

/**
 * Talks to Papermark's session-authenticated dashboard API.
 *
 * The cookie name differs by deployment: hosted Papermark sets
 * `__Secure-next-auth.session-token`, a self-hosted instance on plain HTTP
 * sets `next-auth.session-token`. We send whichever the user gave us, and if
 * they pasted a bare token we try both names.
 */
export class PapermarkSessionClient {
  private readonly cookieHeader: string;

  constructor(
    rawCookie: string,
    private readonly baseUrl: string = PAPERMARK_APP
  ) {
    this.cookieHeader = normalizeCookie(rawCookie);
    this.baseUrl = this.baseUrl.replace(/\/+$/, "");
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      redirect: "manual",
      headers: {
        cookie: this.cookieHeader,
        "content-type": "application/json",
        accept: "application/json",
        ...init.headers,
      },
    });

    // next-auth bounces unauthenticated dashboard calls to the sign-in page
    // rather than returning 401, so a redirect means "cookie is no good".
    if (res.status >= 300 && res.status < 400) {
      throw new PapermarkSessionError(
        "Papermark redirected to sign-in - the session cookie is expired or invalid.",
        res.status
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new PapermarkSessionError(
        "Papermark rejected the session cookie.",
        res.status
      );
    }
    if (!res.ok) {
      throw new PapermarkSessionError(
        `Papermark returned ${res.status} for ${path}`,
        res.status
      );
    }
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      throw new PapermarkSessionError(
        "Papermark returned a sign-in page - the session cookie is expired or invalid."
      );
    }
    return JSON.parse(text) as T;
  }

  /** Doubles as the cookie validity check; also the only way to learn team ids. */
  async listTeams(): Promise<PmTeam[]> {
    const teams = await this.call<PmTeam[]>("/api/teams");
    if (!Array.isArray(teams)) {
      throw new PapermarkSessionError("Unexpected response from Papermark.");
    }
    return teams.map((t) => ({ id: t.id, name: t.name }));
  }

  /**
   * Fetch one document's bytes.
   *
   * The presigned URL Papermark hands back lives for about two minutes, so it
   * is fetched immediately rather than collected and downloaded in a later
   * pass - batching URLs would expire most of them.
   */
  async downloadDocument(
    teamId: string,
    documentId: string,
    signal?: AbortSignal
  ): Promise<{ body: Buffer; fileName: string; contentType: string }> {
    const { downloadUrl, fileName } = await this.call<{
      downloadUrl: string;
      fileName: string;
    }>(`/api/teams/${teamId}/documents/${documentId}/download`, {
      method: "POST",
      signal,
    });

    if (!downloadUrl) {
      throw new PapermarkSessionError("Papermark returned no download URL.");
    }

    // The presigned/CloudFront URL is public for its short lifetime; sending
    // the session cookie to a storage host would be a credential leak.
    const fileRes = await fetch(downloadUrl, { signal });
    if (!fileRes.ok) {
      throw new PapermarkSessionError(
        `Downloading the file failed with ${fileRes.status}.`,
        fileRes.status
      );
    }
    return {
      body: Buffer.from(await fileRes.arrayBuffer()),
      fileName: fileName || documentId,
      contentType:
        fileRes.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}

/**
 * Accepts any of: a full `Cookie:` header line, a `name=value` pair, or a bare
 * JWT copied out of devtools. Users paste all three, and telling them apart is
 * cheaper than making them get it right.
 */
export function normalizeCookie(raw: string): string {
  const value = raw.trim().replace(/^cookie:\s*/i, "");
  if (value.includes("=")) return value;
  // Bare token: offer it under both cookie names so either deployment works.
  return `__Secure-next-auth.session-token=${value}; next-auth.session-token=${value}`;
}

// ------------------------------------------------------------ manual matching

/**
 * Match user-supplied files to scanned documents.
 *
 * Papermark strips the extension from a document's display name, so a file
 * `Q3 Board Deck.pdf` has to match a document named `Q3 Board Deck`. Matching
 * is case-insensitive and extension-insensitive, and falls back to the folder
 * path when two documents share a name.
 */
export function normalizeForMatch(name: string): string {
  return name
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

export type ManualFileEntry = {
  /** Storage key of the already-uploaded file. */
  key: string;
  name: string;
  size: number;
  contentType: string;
  /** Directory portion of webkitRelativePath, if the user dropped a folder. */
  relativeDir: string;
};

export function matchManualFiles(
  documents: { id: string; name: string; folderPath?: string }[],
  files: ManualFileEntry[]
): {
  matched: Map<string, ManualFileEntry>;
  unmatchedFiles: ManualFileEntry[];
  unmatchedDocuments: { id: string; name: string }[];
} {
  const byName = new Map<string, ManualFileEntry[]>();
  for (const f of files) {
    const k = normalizeForMatch(f.name);
    const list = byName.get(k);
    if (list) list.push(f);
    else byName.set(k, [f]);
  }

  const matched = new Map<string, ManualFileEntry>();
  const used = new Set<ManualFileEntry>();
  const unmatchedDocuments: { id: string; name: string }[] = [];

  for (const doc of documents) {
    const candidates = (byName.get(normalizeForMatch(doc.name)) ?? []).filter(
      (c) => !used.has(c)
    );
    if (candidates.length === 0) {
      unmatchedDocuments.push({ id: doc.id, name: doc.name });
      continue;
    }
    // Prefer a candidate whose directory echoes the document's folder path,
    // which disambiguates same-named files in different folders.
    const wanted = (doc.folderPath ?? "").toLowerCase();
    const best =
      candidates.find((c) =>
        wanted ? wanted.includes(c.relativeDir.toLowerCase()) : false
      ) ?? candidates[0];
    matched.set(doc.id, best);
    used.add(best);
  }

  return {
    matched,
    unmatchedFiles: files.filter((f) => !used.has(f)),
    unmatchedDocuments,
  };
}
