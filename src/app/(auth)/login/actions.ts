"use server";

import { z } from "zod";
import { createVerificationToken } from "@/lib/tokens";
import { sendMagicLink } from "@/lib/email";
import { requestOrigin } from "@/lib/origin";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export type LoginState = { ok: boolean; message: string } | null;

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = z
    .string()
    .email()
    .safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success)
    return { ok: false, message: "Enter a valid email address." };

  const email = parsed.data;
  // Throttle sign-in emails so this endpoint cannot be used to mailbomb an
  // arbitrary inbox or flood the token table (per IP and per target address).
  const ip = await clientIp();
  if (
    !rateLimit(`login:ip:${ip}`, 10, 10 * 60_000).ok ||
    !rateLimit(`login:email:${email}`, 5, 10 * 60_000).ok
  )
    return {
      ok: false,
      message: "Too many sign-in attempts. Please try again in a few minutes.",
    };
  const token = await createVerificationToken({
    email,
    purpose: "LOGIN",
    ttlMinutes: 30,
  });
  const origin = await requestOrigin();
  const res = await sendMagicLink(
    email,
    `${origin}/api/auth/verify?token=${token}`
  );
  if (!res.ok)
    return {
      ok: false,
      message: "The sign-in email could not be sent. Try again in a moment.",
    };
  return {
    ok: true,
    message: `We sent a sign-in link to ${email}. It expires in 30 minutes.`,
  };
}
