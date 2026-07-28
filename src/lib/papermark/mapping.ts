/**
 * Papermark -> Foyer field mapping.
 *
 * This module is pure (no db, no network) so the same code can both *preview*
 * what an import will do and *perform* it. Every conversion that loses
 * information returns a `Caveat` instead of silently dropping it: the review
 * screen shows the user exactly what will not survive the move before they
 * commit, and the finished import keeps the list as a receipt.
 *
 * The guiding rule: never invent data. Where Papermark will not tell us
 * something (a link's password, an agreement's content), we say so loudly
 * rather than guessing a substitute.
 */

import type { AccessMode } from "@prisma/client";
import type { PmLink, PmWatermarkConfig } from "./client";

export type CaveatSeverity = "blocking" | "lossy" | "note";

export type Caveat = {
  severity: CaveatSeverity;
  /** Stable key so identical caveats can be grouped and counted in the UI. */
  code: string;
  message: string;
};

// --------------------------------------------------------------------- links

export type MappedLinkSettings = {
  accessMode: AccessMode;
  expiresAt: Date | null;
  allowDownload: boolean;
  allowList: string[];
  blockList: string[];
  screenshotProtection: boolean;
  watermark: boolean;
  notifyOnAccess: boolean;
  welcomeMessage: string | null;
  enableQA: boolean;
};

/**
 * Papermark encodes email gating as two independent booleans; Foyer models the
 * same three states as one enum. `email_authenticated` implies the viewer had
 * to prove the address, which is Foyer's EMAIL_VERIFIED.
 */
export function mapAccessMode(link: PmLink): AccessMode {
  if (link.email_authenticated) return "EMAIL_VERIFIED";
  if (link.email_protected) return "EMAIL";
  return "PUBLIC";
}

/**
 * Papermark's watermark is a rich config (tiling, rotation, opacity, position,
 * template tokens); Foyer's is a boolean that renders email + timestamp. We
 * keep the intent (watermarking stays on) and report the styling loss.
 */
function watermarkCaveats(cfg: PmWatermarkConfig | null): Caveat[] {
  if (!cfg) return [];
  const styled =
    cfg.is_tiled ||
    cfg.rotation ||
    cfg.position ||
    cfg.color ||
    cfg.font_size ||
    cfg.opacity !== undefined;
  if (!styled) return [];
  return [
    {
      severity: "lossy",
      code: "watermark_style",
      message:
        "Watermark stays enabled, but Foyer renders its own email + timestamp overlay - Papermark's custom text, tiling, rotation, colour and opacity are not carried over.",
    },
  ];
}

export function mapLinkSettings(link: PmLink): {
  settings: MappedLinkSettings;
  caveats: Caveat[];
} {
  const caveats: Caveat[] = [];

  // A password hash is never returned by the API, and we will not silently
  // publish a link that used to be password-protected.
  if (link.is_password_protected) {
    caveats.push({
      severity: "blocking",
      code: "password",
      message:
        "This link is password-protected. Papermark never returns the password, so a new one must be set during import or the link would become less restricted than it is today.",
    });
  }

  if (link.enable_agreement) {
    caveats.push({
      severity: "blocking",
      code: "agreement",
      message:
        "This link requires an NDA. Papermark's API does not expose agreement documents, so the NDA must be re-created in Foyer and attached, or the gate would be dropped.",
    });
  }

  caveats.push(...watermarkCaveats(link.watermark_config));

  if (link.enable_confidential_view) {
    caveats.push({
      severity: "lossy",
      code: "confidential_view",
      message:
        "Confidential view has no Foyer equivalent. Downloads are disabled on import to keep the link at least as restrictive.",
    });
  }

  if (link.custom_fields.length > 0) {
    caveats.push({
      severity: "lossy",
      code: "custom_fields",
      message: `${link.custom_fields.length} custom viewer form field${
        link.custom_fields.length === 1 ? "" : "s"
      } (${link.custom_fields
        .map((f) => f.label)
        .slice(0, 3)
        .join(", ")}) cannot be recreated - Foyer collects email only.`,
    });
  }

  if (link.enable_feedback) {
    caveats.push({
      severity: "note",
      code: "feedback",
      message: "Per-page feedback prompts are not a Foyer feature.",
    });
  }

  if (link.show_banner) {
    caveats.push({
      severity: "note",
      code: "banner",
      message: "The end-of-document signup banner is not a Foyer feature.",
    });
  }

  return {
    settings: {
      accessMode: mapAccessMode(link),
      expiresAt: link.expires_at ? new Date(link.expires_at) : null,
      // Confidential view means "view only" in Papermark; honour the stricter
      // of the two signals rather than trusting allow_download alone.
      allowDownload: link.allow_download && !link.enable_confidential_view,
      allowList: [...link.allow_list],
      blockList: [...link.deny_list],
      screenshotProtection: link.enable_screenshot_protection,
      watermark: link.enable_watermark,
      notifyOnAccess: link.enable_notification,
      welcomeMessage: link.welcome_message,
      enableQA: false,
    },
    caveats,
  };
}

// --------------------------------------------------------------------- slugs

/** Foyer slugs accept letters, numbers, dash and underscore, max 64. */
export function sanitizeSlug(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 64);
}

export type UrlPlan = {
  /** Host the link lives on today, for display. */
  currentUrl: string;
  /** Papermark custom domain, if any. */
  domain: string | null;
  /** Slug we intend to claim in Foyer. */
  slug: string;
  /**
   * True when re-pointing DNS at Foyer reproduces the existing URL exactly.
   * Only ever true for custom-domain links: we do not control papermark.com,
   * so a papermark.com/view/<id> URL can never be served by Foyer.
   */
  exactPreservable: boolean;
};

/**
 * Decide which slug a migrated link should claim.
 *
 * Custom-domain links keep their slug verbatim, so `acme.com/deck` keeps
 * working the moment DNS points at Foyer.
 *
 * Default links live at `papermark.com/view/<linkId>`. That host is not ours
 * and never will be, so the URL cannot be preserved. We still reuse the link
 * id as the Foyer slug: the *path* (`/view/<id>`) then matches byte-for-byte,
 * which keeps the mapping obvious to a human and means anything that
 * rewrites only the host resolves correctly.
 */
export function planLinkUrl(link: PmLink): UrlPlan {
  if (link.domain && link.slug) {
    return {
      currentUrl: link.url,
      domain: link.domain,
      slug: sanitizeSlug(link.slug),
      exactPreservable: true,
    };
  }
  return {
    currentUrl: link.url,
    domain: null,
    slug: sanitizeSlug(link.slug ?? link.id),
    exactPreservable: false,
  };
}

// -------------------------------------------------------------------- groups

/**
 * Foyer removed viewer groups; per-link allow lists cover the same ground.
 * A Papermark group link admits a group's members plus anyone on its domain
 * allow list, which maps cleanly onto Foyer's `allowList` (it accepts both
 * bare emails and `@domain.com` entries).
 */
export function mapGroupToAllowList(group: {
  domains: string[];
  memberEmails: string[];
}): string[] {
  const entries = new Set<string>();
  for (const d of group.domains) {
    const clean = d.trim().toLowerCase();
    if (clean) entries.add(clean.startsWith("@") ? clean : `@${clean}`);
  }
  for (const e of group.memberEmails) {
    const clean = e.trim().toLowerCase();
    if (clean) entries.add(clean);
  }
  return [...entries];
}

// ------------------------------------------------------------------ document

/**
 * Papermark's `type` is a loose string ("pdf", "notion", "link", "sheet"...).
 * Foyer keys document type off the filename, so we only need to detect the two
 * cases that are not files at all.
 */
export function isExternalDocument(type: string | null): boolean {
  return type === "notion" || type === "link";
}

/**
 * Papermark strips the extension from `name` for display but keeps the real
 * content type. Foyer stores `Document.name` without extension and
 * `DocumentVersion.fileName` with it, so we reconstruct a filename.
 */
const CT_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.ms-powerpoint": "ppt",
  "text/csv": "csv",
  "text/plain": "txt",
  "text/markdown": "md",
};

export function fileNameFor(
  name: string,
  contentType: string | null,
  type: string | null
): string {
  if (/\.[a-z0-9]{1,5}$/i.test(name)) return name;
  const ext =
    (contentType && CT_EXT[contentType.split(";")[0].trim().toLowerCase()]) ||
    (type && /^[a-z0-9]{1,5}$/i.test(type) ? type.toLowerCase() : null);
  return ext ? `${name}.${ext}` : name;
}
