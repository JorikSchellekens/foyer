import "server-only";

/**
 * Typed client for the Papermark public API (https://api.papermark.com/v1).
 *
 * Two things shape this file:
 *
 * 1. Papermark rate-limits a token to 60 requests/minute (sliding window) and
 *    returns `X-RateLimit-*` headers. A migration is request-heavy - every
 *    dataroom needs a folder page and a document page - so the client
 *    self-throttles and honours 429 `Retry-After` rather than letting an
 *    import die halfway through.
 * 2. Everything is cursor-paginated (`next_cursor`), never offset. `pageAll`
 *    is the only way we read collections so no caller can accidentally import
 *    just the first 25 rows.
 *
 * Naming note: Papermark returns `created` (not `created_at`) on every object,
 * and `Document.url` is null for file-based documents - the bytes are NOT
 * reachable from this API. See ./files.ts for how the migration gets them.
 */

export const PAPERMARK_API = "https://api.papermark.com";

export class PapermarkError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PapermarkError";
  }

  /** True when the token is wrong/expired rather than the request being bad. */
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
}

// ---------------------------------------------------------------- object types

export type PmDocument = {
  id: string;
  object: "document";
  name: string;
  type: string | null;
  content_type: string | null;
  /** External target for `link`/`notion` docs; null for real files. */
  url: string | null;
  num_pages: number | null;
  folder_id: string | null;
  created: string;
  updated_at: string;
};

export type PmDocumentVersion = {
  id: string;
  object: "document_version";
  version_number: number;
  is_primary: boolean;
  type: string | null;
  content_type: string | null;
  num_pages: number | null;
  file_size: number | null;
  created: string;
  updated_at: string;
};

export type PmFolder = {
  id: string;
  object: "folder";
  name: string;
  parent_id: string | null;
  path: string;
  icon: string | null;
  color: string | null;
  document_count: number;
  child_folder_count: number;
  created: string;
  updated_at: string;
};

export type PmWatermarkConfig = {
  text?: string;
  is_tiled?: boolean;
  position?: string;
  rotation?: number;
  color?: string;
  font_size?: number;
  opacity?: number;
};

export type PmLinkCustomField = {
  type: string;
  identifier: string;
  label: string;
  placeholder: string | null;
  required: boolean;
  disabled: boolean;
  order_index: number;
};

export type PmLink = {
  id: string;
  object: "link";
  name: string | null;
  target_type: "document" | "dataroom";
  audience_type: "general" | "group" | "team";
  group_id: string | null;
  document_id: string | null;
  dataroom_id: string | null;
  url: string;
  /** Custom domain host, e.g. "dataroom.acme.com". Null on papermark.com. */
  domain: string | null;
  slug: string | null;
  expires_at: string | null;
  is_password_protected: boolean;
  email_protected: boolean;
  email_authenticated: boolean;
  allow_download: boolean;
  allow_list: string[];
  deny_list: string[];
  enable_watermark: boolean;
  watermark_config: PmWatermarkConfig | null;
  enable_feedback: boolean;
  enable_screenshot_protection: boolean;
  enable_confidential_view: boolean;
  enable_agreement: boolean;
  agreement_id: string | null;
  welcome_message: string | null;
  enable_notification: boolean;
  show_banner: boolean;
  custom_fields: PmLinkCustomField[];
  created: string;
  updated_at: string;
};

export type PmDataroom = {
  id: string;
  object: "dataroom";
  pid: string;
  name: string;
  internal_name: string | null;
  description: string | null;
  document_count: number;
  folder_count: number;
  conversations_enabled: boolean;
  agents_enabled: boolean;
  allow_bulk_download: boolean;
  is_frozen: boolean;
  created: string;
  updated_at: string;
};

export type PmDataroomFolder = PmFolder & { order_index: number | null };

export type PmDataroomItem = {
  id: string;
  object: "dataroom_document";
  /** Id of the underlying library Document - this is what we map to. */
  document_id: string;
  document_name: string;
  type: string | null;
  content_type: string | null;
  url: string | null;
  num_pages: number | null;
  folder_id: string | null;
  folder_path: string | null;
  order_index: number | null;
  created: string;
};

export type PmLinkPermission = {
  object: "link_permission";
  item_id: string;
  item_type: "dataroom_document" | "dataroom_folder";
  can_view: boolean;
  can_download: boolean;
  can_download_original: boolean;
  updated_at: string;
};

export type PmVisitor = {
  id: string;
  object: "visitor";
  email: string;
  verified: boolean;
  dataroom_id: string | null;
  invited_at: string | null;
  total_views: number;
  last_viewed_at: string | null;
  created: string;
  updated_at: string;
};

type Page<T> = { data: T[]; next_cursor: string | null };

// ------------------------------------------------------------------ throttling

/**
 * Papermark allows 60 req/min per token. We pace at a slightly safer 50/min
 * spread evenly (1.2s apart) instead of bursting and eating 429s: a steady
 * drip finishes a large import sooner than burst-then-backoff, and keeps the
 * user's own dashboard usable while the migration runs.
 */
const MIN_INTERVAL_MS = 1200;

export type PapermarkClientOptions = {
  baseUrl?: string;
  /** Called before each request sleeps, so the UI can show "waiting on rate limit". */
  onThrottle?: (waitMs: number) => void;
  signal?: AbortSignal;
};

export class PapermarkClient {
  private lastRequestAt = 0;
  private readonly baseUrl: string;

  constructor(
    private readonly token: string,
    private readonly opts: PapermarkClientOptions = {}
  ) {
    this.baseUrl = (opts.baseUrl ?? PAPERMARK_API).replace(/\/+$/, "");
  }

  private async pace() {
    const now = Date.now();
    const wait = this.lastRequestAt + MIN_INTERVAL_MS - now;
    if (wait > 0) {
      this.opts.onThrottle?.(wait);
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestAt = Date.now();
  }

  async request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | number | undefined> } = {}
  ): Promise<T> {
    const { query, ...rest } = init;
    const url = new URL(
      path.startsWith("/") ? `${this.baseUrl}${path}` : path
    );
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }

    // Retry only on transient conditions: rate limit and 5xx. A 4xx is a real
    // problem with the request and retrying just burns the token's budget.
    for (let attempt = 0; ; attempt++) {
      await this.pace();
      let res: Response;
      try {
        res = await fetch(url, {
          ...rest,
          signal: this.opts.signal,
          headers: {
            authorization: `Bearer ${this.token}`,
            "content-type": "application/json",
            accept: "application/json",
            ...rest.headers,
          },
        });
      } catch (e) {
        if (attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }

      if (res.status === 429 && attempt < 5) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 0);
        const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0);
        const waitMs =
          retryAfter > 0
            ? retryAfter * 1000
            : reset > 0
              ? Math.max(0, reset * 1000 - Date.now())
              : 5000 * (attempt + 1);
        this.opts.onThrottle?.(waitMs);
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 60_000)));
        continue;
      }

      if (res.status >= 500 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }

      if (!res.ok) {
        let code = "http_error";
        let message = `Papermark returned ${res.status}`;
        try {
          const body = (await res.json()) as {
            error?: { code?: string; message?: string };
          };
          code = body.error?.code ?? code;
          message = body.error?.message ?? message;
        } catch {
          /* non-JSON error body */
        }
        throw new PapermarkError(res.status, code, message);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }
  }

  /** Walk every page of a cursor-paginated collection. */
  private async pageAll<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
    limit = 100
  ): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    // Hard stop so a server-side cursor bug can't spin forever.
    for (let guard = 0; guard < 1000; guard++) {
      const page = await this.request<Page<T>>(path, {
        query: { ...query, limit, cursor },
      });
      out.push(...(page.data ?? []));
      if (!page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return out;
  }

  // ------------------------------------------------------------- read methods

  /**
   * Cheapest authenticated call, used to validate a pasted token. Any success
   * means the token is live and has at least `documents.read`.
   */
  async verifyToken(): Promise<void> {
    await this.request<Page<PmDocument>>("/v1/documents", { query: { limit: 1 } });
  }

  listDocuments() {
    return this.pageAll<PmDocument>("/v1/documents");
  }

  listDocumentVersions(documentId: string) {
    return this.pageAll<PmDocumentVersion>(`/v1/documents/${documentId}/versions`);
  }

  listFolders() {
    return this.pageAll<PmFolder>("/v1/folders", {}, 100);
  }

  listLinks() {
    return this.pageAll<PmLink>("/v1/links");
  }

  listDatarooms() {
    return this.pageAll<PmDataroom>("/v1/datarooms");
  }

  listDataroomFolders(dataroomId: string) {
    return this.pageAll<PmDataroomFolder>(`/v1/datarooms/${dataroomId}/folders`);
  }

  listDataroomDocuments(dataroomId: string) {
    return this.pageAll<PmDataroomItem>(`/v1/datarooms/${dataroomId}/documents`);
  }

  listVisitors() {
    return this.pageAll<PmVisitor>("/v1/visitors");
  }

  async getLinkPermissions(linkId: string): Promise<PmLinkPermission[]> {
    const res = await this.request<{ data: PmLinkPermission[] }>(
      `/v1/links/${linkId}/permissions`
    );
    return res.data ?? [];
  }

  // ------------------------------------------------------------ write methods
  // Used only by the temporary-download-link file strategy (see ./files.ts).

  createLink(body: Record<string, unknown>) {
    return this.request<PmLink>("/v1/links", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteLink(linkId: string) {
    await this.request(`/v1/links/${linkId}`, { method: "DELETE" });
  }
}
