import { NextRequest, NextResponse } from "next/server";
import { verifyPayload } from "@/lib/auth";
import { getViewerSession, setViewerSession } from "@/lib/access";

/**
 * Persists the active View id into the viewer's gate cookie. Cookies cannot
 * be written while rendering the viewer page, so the client claims its view
 * right after mount using the signed track token.
 */
export async function POST(req: NextRequest) {
  let body: { token?: string; viewId?: string };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  if (!body.token || !body.viewId)
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  const payload = await verifyPayload<{ vid?: string; lid?: string }>(
    body.token
  );
  if (!payload?.vid || !payload.lid || payload.vid !== body.viewId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getViewerSession(payload.lid);
  if (session.viewId !== payload.vid) {
    await setViewerSession({
      ...session,
      linkId: payload.lid,
      viewId: payload.vid,
    });
  }
  return NextResponse.json({ ok: true });
}
