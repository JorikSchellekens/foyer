import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "crypto";

/**
 * Reversible encryption for third-party credentials we must hold briefly and
 * replay - a Papermark API token during a migration, for example.
 *
 * This is deliberately separate from lib/tokens.ts: everything there is a
 * one-way hash, which is the right default and must stay the default. Reach
 * for this module only when the plaintext genuinely has to come back out, and
 * delete the ciphertext as soon as the job that needed it is finished.
 *
 * AES-256-GCM with a per-message random IV, keyed by HKDF over AUTH_SECRET so
 * no new secret has to be provisioned. Rotating AUTH_SECRET invalidates every
 * stored ciphertext, which for short-lived migration credentials is the
 * correct, safe failure mode.
 */

const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret), Buffer.alloc(0), "foyer:secret-box", 32)
  );
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

/** Returns null for anything unreadable - wrong key, tampering, old format. */
export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(parts[1], "base64url")
    );
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
