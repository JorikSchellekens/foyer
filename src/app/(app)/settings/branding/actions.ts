"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";

export type BrandingInput = {
  dataroomId?: string | null;
  logoKey?: string | null;
  bannerKey?: string | null;
  brandColor: string;
  backgroundColor: string;
  applyBgToDataroom: boolean;
  welcomeMessage?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaImageKey?: string | null;
};

const COLOR = /^#[0-9a-fA-F]{6}$/;

export async function saveBranding(input: BrandingInput) {
  const ctx = await requireTeam();
  if (!COLOR.test(input.brandColor) || !COLOR.test(input.backgroundColor))
    return { error: "Colors must be hex values like #175B47." };

  const dataroomId = input.dataroomId ?? null;
  if (dataroomId) {
    const dr = await db.dataroom.findFirst({
      where: { id: dataroomId, teamId: ctx.team.id },
    });
    if (!dr) return { error: "Data room not found." };
  }

  const data = {
    logoKey: input.logoKey ?? null,
    bannerKey: input.bannerKey ?? null,
    brandColor: input.brandColor,
    backgroundColor: input.backgroundColor,
    applyBgToDataroom: input.applyBgToDataroom,
    welcomeMessage: input.welcomeMessage ?? null,
    ctaLabel: input.ctaLabel ?? null,
    ctaUrl: input.ctaUrl ?? null,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
    metaImageKey: input.metaImageKey ?? null,
  };

  const existing = await db.branding.findFirst({
    where: { teamId: ctx.team.id, dataroomId },
  });
  if (existing) {
    await db.branding.update({ where: { id: existing.id }, data });
  } else {
    await db.branding.create({
      data: { ...data, teamId: ctx.team.id, dataroomId },
    });
  }

  revalidatePath("/settings/branding");
  if (dataroomId) revalidatePath(`/datarooms/${dataroomId}`);
  return { ok: true };
}

export async function resetBranding(dataroomId?: string | null) {
  const ctx = await requireTeam();
  await db.branding.deleteMany({
    where: { teamId: ctx.team.id, dataroomId: dataroomId ?? null },
  });
  revalidatePath("/settings/branding");
  if (dataroomId) revalidatePath(`/datarooms/${dataroomId}`);
}

/**
 * Auto-fill from a website: pull title, description, og image, icon and
 * theme color from the page's HTML.
 */
export async function scrapeBranding(url: string) {
  await requireTeam();
  let target: URL;
  try {
    target = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return { error: "Enter a valid website URL." };
  }
  if (!["http:", "https:"].includes(target.protocol))
    return { error: "Only http(s) URLs are supported." };

  try {
    const res = await fetch(target.toString(), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; FoyerBot/1.0)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const html = (await res.text()).slice(0, 500_000);

    const meta = (name: string) => {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
        "i"
      );
      const reInv = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
        "i"
      );
      return html.match(re)?.[1] ?? html.match(reInv)?.[1] ?? null;
    };
    const linkIcon = () => {
      const m = html.match(
        /<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i
      );
      return m?.[1] ?? null;
    };
    const abs = (u: string | null) => {
      if (!u) return null;
      try {
        return new URL(u, target).toString();
      } catch {
        return null;
      }
    };

    return {
      title: meta("og:site_name") ?? meta("og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null,
      description: meta("og:description") ?? meta("description"),
      themeColor: meta("theme-color"),
      logoUrl: abs(linkIcon()),
      bannerUrl: abs(meta("og:image")),
    };
  } catch {
    return { error: "Could not reach that website." };
  }
}

/** Copy a remote image into our storage so branding never hotlinks. */
export async function importImageFromUrl(url: string) {
  const ctx = await requireTeam();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; FoyerBot/1.0)" },
    });
    if (!res.ok) return { error: "Image could not be downloaded." };
    const contentType = res.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/"))
      return { error: "That URL is not an image." };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024)
      return { error: "Image is larger than 4 MB." };
    const { newFileKey, putObject } = await import("@/lib/storage");
    const ext = contentType.split("/")[1]?.split("+")[0] ?? "png";
    const key = newFileKey(ctx.team.id, `brand.${ext}`);
    await putObject(key, buf, contentType);
    return { key };
  } catch {
    return { error: "Image could not be downloaded." };
  }
}
