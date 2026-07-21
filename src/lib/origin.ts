import "server-only";
import { headers } from "next/headers";

function protoFor(host: string, forwardedProto?: string | null) {
  if (forwardedProto) return forwardedProto.split(",")[0].trim();
  return host.startsWith("localhost") || host.startsWith("127.")
    ? "http"
    : "https";
}

function fallbackOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * Origin of the current request (scheme + host + port), so links and
 * redirects work on whatever host/port the app is actually served from.
 * Falls back to NEXT_PUBLIC_APP_URL outside a request context.
 */
export async function requestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${protoFor(host, h.get("x-forwarded-proto"))}://${host}`;
  } catch {
    // not in a request scope
  }
  return fallbackOrigin();
}

/** Same, from an explicit Request (route handlers). */
export function originFromRequest(req: Request): string {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host)
    return `${protoFor(host, req.headers.get("x-forwarded-proto"))}://${host}`;
  return fallbackOrigin();
}

/** Host (no scheme) of the current request. */
export async function requestHost(): Promise<string> {
  return new URL(await requestOrigin()).host;
}
