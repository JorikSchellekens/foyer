import "server-only";
import { headers } from "next/headers";

/**
 * In-memory fixed-window rate limiter. Per-instance by design: the app runs as
 * a single container on Coolify, so a process-local map is sufficient and needs
 * no external store. If the deployment is ever scaled horizontally, swap the
 * backing store here for Redis without touching call sites.
 */
type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

// Opportunistic cleanup so the map cannot grow without bound under attack.
function sweep(now: number) {
  if (windows.size < 10_000) return;
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
}

export type RateLimitResult = { ok: boolean; retryAfter: number };

/**
 * Consume one unit against `key`. Returns ok=false with retryAfter (seconds)
 * once `limit` requests have been seen within `windowMs`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (w.count >= limit)
    return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  w.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers, for keying limits. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
