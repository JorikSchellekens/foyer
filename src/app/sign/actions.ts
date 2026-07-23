"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getSignerSession } from "@/lib/sign-session";
import { completeSigner, declineSigner } from "@/lib/signing";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/origin";

const submitSchema = z.object({
  name: z.string().max(120).optional(),
  signatureData: z.string().startsWith("data:image/png;base64,").max(500_000).optional(),
  initialsData: z.string().startsWith("data:image/png;base64,").max(500_000).optional(),
  values: z.record(z.string(), z.string().max(2_000)),
  consent: z.boolean(),
});

export async function submitSignature(requestId: string, input: unknown) {
  const session = await getSignerSession(requestId);
  if (!session) return { error: "Your signing session has expired. Reopen the link from your email." };

  const ip = await clientIp();
  if (!rateLimit(`sign-submit:${ip}`, 20, 10 * 60_000).ok)
    return { error: "Too many attempts. Please try again in a few minutes." };

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid submission." };
  if (!parsed.data.consent)
    return { error: "Agree to sign electronically to finish." };

  const h = await headers();
  return completeSigner(
    session.signerId,
    {
      name: parsed.data.name,
      signatureData: parsed.data.signatureData ?? null,
      initialsData: parsed.data.initialsData ?? null,
      values: parsed.data.values,
    },
    ip === "unknown" ? null : ip,
    h.get("user-agent"),
    await requestOrigin()
  );
}

export async function declineToSign(requestId: string, reason: string) {
  const session = await getSignerSession(requestId);
  if (!session) return { error: "Your signing session has expired. Reopen the link from your email." };
  const ip = await clientIp();
  if (!rateLimit(`sign-decline:${ip}`, 10, 10 * 60_000).ok)
    return { error: "Too many attempts. Please try again in a few minutes." };
  const h = await headers();
  return declineSigner(
    session.signerId,
    reason.trim().slice(0, 500) || null,
    ip === "unknown" ? null : ip,
    h.get("user-agent")
  );
}
