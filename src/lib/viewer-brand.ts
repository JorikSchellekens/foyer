import "server-only";
import { db } from "@/lib/db";
import type { FullLink } from "@/lib/access";
import type { GateBrand } from "@/components/viewer/gates";
import type { Branding } from "@prisma/client";

export async function resolveBranding(
  link: FullLink
): Promise<Branding | null> {
  if (link.dataroom?.branding) return link.dataroom.branding;
  return db.branding.findFirst({
    where: { teamId: link.teamId, dataroomId: null },
  });
}

export function gateBrand(
  link: FullLink,
  branding: Branding | null
): GateBrand {
  return {
    teamName: link.team.name,
    itemName: link.document?.name ?? link.dataroom?.name ?? link.name,
    brandColor: branding?.brandColor ?? "#175B47",
    backgroundColor: branding?.backgroundColor ?? "#101418",
    logoUrl: branding?.logoKey ? `/api/assets/${branding.logoKey}` : null,
    bannerUrl: branding?.bannerKey ? `/api/assets/${branding.bannerKey}` : null,
    welcomeMessage: link.welcomeMessage ?? branding?.welcomeMessage ?? null,
  };
}
