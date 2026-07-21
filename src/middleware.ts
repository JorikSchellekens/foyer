import { NextRequest, NextResponse } from "next/server";

/**
 * Custom domains serve only the viewer: dataroom.acme.com/<slug> is rewritten
 * to /view/<slug>; the app itself stays on the primary host.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const appHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
        .host;
    } catch {
      return "localhost:3000";
    }
  })();

  const hostname = host.split(":")[0];
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
