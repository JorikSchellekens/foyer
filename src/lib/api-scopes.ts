/**
 * What an API key may do. Shared by the server (enforcement) and the settings
 * page (the picker), so it carries no server-only imports.
 *
 * - read:   list and read documents, data rooms, links and analytics
 * - write:  add documents and organise the library and data rooms
 * - share:  create and change sharing links, send invitations, and change
 *           content that is already shared through a live link (adding a
 *           document to a shared room is publishing it, whichever tool does it)
 * - delete: permanently delete documents and data rooms
 */
export const API_SCOPES = ["read", "write", "share", "delete"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABEL: Record<ApiScope, string> = {
  read: "Read",
  write: "Organise",
  share: "Share",
  delete: "Delete",
};

export type ScopePreset = {
  id: "read" | "organise" | "share" | "full";
  label: string;
  description: string;
  scopes: ApiScope[];
};

/** The choices offered when a key is created, least access first. */
export const SCOPE_PRESETS: ScopePreset[] = [
  {
    id: "read",
    label: "Read only",
    description:
      "Read documents and their text, data rooms, sharing links with their URLs, and visitor analytics.",
    scopes: ["read"],
  },
  {
    id: "organise",
    label: "Organise",
    description:
      "Also add, rename and file documents, and create and arrange data rooms. Cannot make sharing links, and cannot change a room or document that is already shared through a live link.",
    scopes: ["read", "write"],
  },
  {
    id: "share",
    label: "Organise and share",
    description:
      "Also create and change sharing links, send email invitations, and change rooms and documents that are already shared. Visitors see those changes at once.",
    scopes: ["read", "write", "share"],
  },
  {
    id: "full",
    label: "Full access",
    description:
      "Also permanently delete documents and data rooms, with their links and visit history.",
    scopes: ["read", "write", "share", "delete"],
  },
];

/** Keep only known scopes, in canonical order, without duplicates. */
export function normalizeScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return [];
  return API_SCOPES.filter((s) => input.includes(s));
}

export function presetFor(scopes: readonly string[]): ScopePreset | null {
  const norm = normalizeScopes(scopes);
  return (
    SCOPE_PRESETS.find(
      (p) =>
        p.scopes.length === norm.length &&
        p.scopes.every((s) => norm.includes(s))
    ) ?? null
  );
}

/** Days a key may live. null = no expiry. */
export const EXPIRY_CHOICES: { days: number | null; label: string }[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: null, label: "No expiry" },
];
