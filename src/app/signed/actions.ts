"use server";

import { z } from "zod";
import { createVerificationToken } from "@/lib/tokens";
import { sendSignedPortalLink } from "@/lib/email";
import { clearPortalSession } from "@/lib/sign-session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/origin";

/**
 * Request a magic link to the signed-documents portal. Always answers "sent"
 * so the endpoint cannot be used to probe which emails have signed here.
 */
export async function requestPortalLink(emailRaw: string) {
  const parsed = z.string().email().safeParse(emailRaw.trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid email address." };
  const email = parsed.data;

  const ip = await clientIp();
  if (
    !rateLimit(`portal:ip:${ip}`, 10, 10 * 60_000).ok ||
    !rateLimit(`portal:email:${email}`, 5, 10 * 60_000).ok
  )
    return { error: "Too many attempts. Please try again in a few minutes." };

  const token = await createVerificationToken({
    email,
    purpose: "SIGNED_PORTAL",
    ttlMinutes: 30,
  });
  await sendSignedPortalLink(email, `${await requestOrigin()}/signed/t/${token}`);
  return { ok: true };
}

export async function switchPortalEmail() {
  await clearPortalSession();
}
