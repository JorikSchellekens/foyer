import { cache } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { FoyerLogo, FoyerMark } from "@/components/brand/logo";

/** Same rule the viewer gates use: ink on light surfaces, paper on dark. */
function contrastText(hex: string): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#16181d" : "#ffffff";
}

/**
 * The domain this request arrived on, with the team's branding if it is one we
 * host. cache() so generateMetadata and the page share a single lookup.
 */
const resolveHost = cache(async () => {
  const h = await headers();
  const raw = (h.get("x-forwarded-host") ?? h.get("host") ?? "").trim();
  if (!raw) return null;
  // resolveLink matches the Host header verbatim; fall back to the bare
  // hostname so a non-standard port still finds its domain.
  const candidates = [raw, raw.split(":")[0].toLowerCase()];
  for (const domain of candidates) {
    const record = await db.domain.findUnique({
      where: { domain },
      include: { team: true },
    });
    if (!record) continue;
    const branding = await db.branding.findFirst({
      where: { teamId: record.teamId, dataroomId: null },
    });
    return { team: record.team, branding };
  }
  return null;
});

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await resolveHost();
  // absolute: a client's own domain should not advertise Foyer in the tab.
  return ctx
    ? { title: { absolute: ctx.team.name }, description: null }
    : { title: { absolute: "Private document links" } };
}

/**
 * Root of a custom domain (e.g. https://dataroom.acme.com/). There is no
 * public listing; visitors need a full link. Dressed in the team's branding
 * when the domain resolves to one, so the page reads as theirs rather than as
 * a fallback.
 */
export default async function DomainRootPage() {
  const ctx = await resolveHost();
  const background = ctx?.branding?.backgroundColor ?? "#101418";
  const brand = ctx?.branding?.brandColor ?? "#4caf8b";
  const text = contrastText(background);
  const logoUrl = ctx?.branding?.logoKey
    ? `/api/assets/${ctx.branding.logoKey}`
    : null;

  return (
    <main
      className="flex min-h-svh flex-col"
      style={{ backgroundColor: background, color: text }}
    >
      <div className="flex flex-1 items-center justify-center px-6 pb-20 pt-16">
        <div className="reveal-up w-full max-w-sm text-center">
          {/* The mark inherits currentColor, so a brand colour is set on the
              wrapper rather than threaded through the component. */}
          <span
            className="inline-flex items-center justify-center"
            style={ctx ? { color: brand } : undefined}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={ctx?.team.name ?? ""}
                className="h-10 w-auto max-w-48 object-contain"
              />
            ) : ctx ? (
              <FoyerMark className="size-9" />
            ) : (
              // No team behind this host: stand on our own name instead.
              <FoyerLogo size="lg" markClassName="text-[#4caf8b]" />
            )}
          </span>
          {ctx && (
            <h1 className="mt-6 font-display text-3xl leading-tight tracking-tight text-balance">
              {ctx.team.name}
            </h1>
          )}
          <p
            className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-pretty"
            style={{ opacity: 0.65 }}
          >
            This domain hosts private document links. There is no index to
            browse: open the link exactly as it was shared with you.
          </p>
        </div>
      </div>
      <footer
        className="flex items-center justify-center gap-1.5 pb-6 text-xs"
        style={{ opacity: 0.4 }}
      >
        <FoyerMark className="size-3" />
        Secured by Foyer
      </footer>
    </main>
  );
}
