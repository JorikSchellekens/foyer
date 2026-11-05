import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Permission check for on-demand TLS (Caddy's `on_demand_tls { ask }`).
 *
 * Before the proxy requests a certificate for an unknown hostname, it calls
 * GET /api/domains/tls-ask?domain=<host>. A 200 lets it issue the cert; any
 * other status refuses. Only domains a team has added under Settings →
 * Custom domains are allowed, so nobody can point arbitrary names at the
 * server and burn through the Let's Encrypt rate limits.
 *
 * Pending domains are allowed too: a domain is added before its DNS is set
 * up, and the first visitor after the CNAME lands should get a working cert.
 */
export async function GET(req: NextRequest) {
  const domain = (req.nextUrl.searchParams.get("domain") ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");

  if (!domain) {
    return NextResponse.json({ allowed: false }, { status: 400 });
  }

  try {
    const found = await db.domain.findUnique({
      where: { domain },
      select: { id: true },
    });
    return NextResponse.json(
      { allowed: Boolean(found) },
      { status: found ? 200 : 404 }
    );
  } catch {
    // Refuse rather than allow when the database is unreachable.
    return NextResponse.json({ allowed: false }, { status: 503 });
  }
}
