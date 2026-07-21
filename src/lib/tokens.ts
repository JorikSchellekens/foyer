import "server-only";
import { randomBytes, createHash, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import type { Prisma, TokenPurpose } from "@prisma/client";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export async function createVerificationToken(opts: {
  email: string;
  purpose: TokenPurpose;
  context?: Record<string, unknown>;
  ttlMinutes?: number;
}) {
  const token = randomToken();
  await db.verificationToken.create({
    data: {
      token,
      email: opts.email.toLowerCase().trim(),
      purpose: opts.purpose,
      context: (opts.context as Prisma.InputJsonValue) ?? undefined,
      expiresAt: new Date(Date.now() + (opts.ttlMinutes ?? 30) * 60_000),
    },
  });
  return token;
}

export async function consumeVerificationToken(
  token: string,
  purpose: TokenPurpose
) {
  const record = await db.verificationToken.findUnique({ where: { token } });
  if (!record || record.purpose !== purpose) return null;
  if (record.usedAt || record.expiresAt < new Date()) return null;
  await db.verificationToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return record;
}

// --- link passwords ---

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

// --- API tokens ---

export function generateApiKey() {
  const key = `foyer_${randomBytes(24).toString("base64url")}`;
  return { key, hashed: hashApiKey(key), partial: `${key.slice(0, 12)}…` };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}
