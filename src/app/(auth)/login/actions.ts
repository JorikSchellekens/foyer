"use server";

import { z } from "zod";
import { createVerificationToken } from "@/lib/tokens";
import { sendMagicLink } from "@/lib/email";
import { requestOrigin } from "@/lib/origin";

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
