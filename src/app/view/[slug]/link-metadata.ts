import "server-only";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { resolveLink } from "@/lib/access";
import { resolveBranding } from "@/lib/viewer-brand";

/**
 * Title, description and social card for a shared link. A direct document link
 * uses the same card as its data room: the card is public, so it names the
 * room and never the document behind the gate.
 */
export async function linkMetadata(slug: string): Promise<Metadata> {
  const h = await headers();
  const link = await resolveLink(h.get("host") ?? "", slug);
  if (!link) return { title: "Not found" };
  const branding = await resolveBranding(link);
  // Preview resolution: link's own fields → link's preview preset →
  // the team's default preview preset → branding → sensible fallback.
  const defaultPreset =
    link.previewPreset ??
    (await db.previewPreset.findFirst({
      where: { teamId: link.teamId, isDefault: true },
    }));
  const title =
    link.metaTitle ??
    defaultPreset?.metaTitle ??
    branding?.metaTitle ??
    `${link.document?.name ?? link.dataroom?.name ?? "Shared documents"} · ${link.team.name}`;
  const description =
    link.metaDescription ??
    defaultPreset?.metaDescription ??
    branding?.metaDescription ??
    `${link.team.name} shared this with you via Foyer.`;
  const imageKey =
    link.metaImageKey ??
    defaultPreset?.metaImageKey ??
    branding?.metaImageKey;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      ...(imageKey ? { images: [`/api/assets/${imageKey}`] } : {}),
    },
    twitter: { card: imageKey ? "summary_large_image" : "summary" },
  };
}
