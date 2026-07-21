import { NextRequest, NextResponse } from "next/server";
import { getTeamContext, verifyPayload } from "@/lib/auth";
import { putObject } from "@/lib/storage";

// Documents can be large (decks, videos); allow generous bodies.
export const maxDuration = 300;

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Streams a browser upload into private object storage. The token issued by
 * /api/upload/presign binds the exact key to the caller's team, so a member
 * cannot write outside their own team's prefix.
 */
export async function PUT(req: NextRequest) {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = req.nextUrl.searchParams.get("token");
  if (!token)
    return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const payload = await verifyPayload<{
    key?: string;
    teamId?: string;
    ct?: string;
  }>(token);
  if (!payload?.key || payload.teamId !== ctx.team.id)
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  // Defence in depth: the key is always prefixed with the team id.
  if (!payload.key.startsWith(`${ctx.team.id}/`))
    return NextResponse.json({ error: "Invalid key" }, { status: 403 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES)
    return NextResponse.json({ error: "File too large" }, { status: 413 });

  let body: Buffer;
  try {
    body = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Upload interrupted. Please try again." },
      { status: 400 }
    );
  }
  if (body.length > MAX_BYTES)
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  // Never persist a partial upload: if fewer bytes arrived than the client
  // declared, the object would be a silently-corrupt file. Fail loudly so the
  // client can retry instead of storing a truncated document.
  if (declared > 0 && body.length !== declared)
    return NextResponse.json(
      {
        error: `Upload incomplete: received ${body.length} of ${declared} bytes. Please try again.`,
      },
      { status: 400 }
    );

  const contentType =
    req.headers.get("content-type") ||
    payload.ct ||
    "application/octet-stream";

  await putObject(payload.key, body, contentType);
  return NextResponse.json({ ok: true, key: payload.key });
}
