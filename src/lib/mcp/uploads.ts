import "server-only";
import { createHash, randomBytes } from "crypto";

/** Largest file the upload endpoint accepts. Matches the in-app uploader. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** How long an upload slot stays open. */
export const UPLOAD_TTL_MS = 15 * 60_000;

/** Largest text document that can be written inline through the MCP. */
export const MAX_TEXT_BYTES = 512 * 1024;

export function newUploadSecret() {
  const secret = `fup_${randomBytes(32).toString("base64url")}`;
  return { secret, hashed: hashUploadSecret(secret) };
}

export function hashUploadSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
