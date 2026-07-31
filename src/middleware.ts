import { NextRequest, NextResponse } from "next/server";

/**
 * Hosts the app used to answer on. They still resolve here, so send them to
 * the current one permanently rather than letting the custom-domain rewrite
 * below mistake them for a viewer domain. Comma-separated, bare hosts.
 */
const LEGACY_HOSTS = (process.env.LEGACY_APP_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/**
 * Custom domains serve only the viewer: dataroom.acme.com/<slug> is rewritten
 * to /view/<slug>; the app itself stays on the primary host.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const appHost = (() => {
    try {
      return new URL(appUrl).host;
    } catch {
      return "localhost:3000";
    }
  })();

  const hostname = host.split(":")[0];

  if (LEGACY_HOSTS.includes(hostname)) {
    const { pathname, search } = req.nextUrl;
    return NextResponse.redirect(new URL(`${pathname}${search}`, appUrl), 301);
  }

  const isPrimary =
    host === appHost ||
    hostname === "localhost" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ||
    hostname.endsWith(".local");

  if (isPrimary) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Shared infrastructure paths pass through on any host.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/view/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  if (pathname === "/") {
    url.pathname = "/domain-root";
  } else {
    url.pathname = `/view${pathname}`;
  }
  return NextResponse.rewrite(url);
}

export const config = {
  // Exclude /api/ so Next does not treat API calls as proxied and buffer their
  // request bodies in memory (which silently truncates large uploads at the
  // proxyClientMaxBodySize cap). Middleware only ever passed /api/ through
  // unchanged, so excluding it is behaviour-preserving.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
