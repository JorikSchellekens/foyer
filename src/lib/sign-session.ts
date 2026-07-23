import "server-only";
import { cookies } from "next/headers";
import { signPayload, verifyPayload } from "@/lib/auth";

// Signer sessions are per-request cookies established by the tokenized email
// link (/sign/t/<token>), mirroring the viewer's per-link fv_ cookies. The
// token itself stays out of the browsing URL after the redirect.

export type SignerSession = {
  requestId: string;
  signerId: string;
};

const cookieName = (requestId: string) => `fs_${requestId}`;

export async function setSignerSession(session: SignerSession) {
  const store = await cookies();
  store.set(cookieName(session.requestId), await signPayload({ ...session }, "30d"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 3600,
    path: "/",
  });
}

export async function getSignerSession(
  requestId: string
): Promise<SignerSession | null> {
  const store = await cookies();
  const raw = store.get(cookieName(requestId))?.value;
  if (!raw) return null;
  const payload = await verifyPayload<SignerSession>(raw);
  if (!payload?.signerId || payload.requestId !== requestId) return null;
  return { requestId: payload.requestId, signerId: payload.signerId };
}

// ---- signed-documents portal (cross-request, keyed by verified email) ----

const PORTAL_COOKIE = "foyer_signed";

export async function setPortalSession(email: string) {
  const store = await cookies();
  store.set(
    PORTAL_COOKIE,
    await signPayload({ portalEmail: email.toLowerCase().trim() }, "30d"),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 3600,
      path: "/",
    }
  );
}

export async function getPortalEmail(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(PORTAL_COOKIE)?.value;
  if (!raw) return null;
  const payload = await verifyPayload<{ portalEmail?: string }>(raw);
  return payload?.portalEmail ?? null;
}

export async function clearPortalSession() {
  const store = await cookies();
  store.delete(PORTAL_COOKIE);
}
