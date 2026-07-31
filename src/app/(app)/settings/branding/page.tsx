import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { BrandingForm } from "@/components/branding/branding-form";
import { SettingsIntro } from "../section";

export default async function BrandingSettingsPage() {
  const ctx = await requireTeam();
  const branding = await db.branding.findFirst({
    where: { teamId: ctx.team.id, dataroomId: null },
  });

  return (
    <div className="space-y-6">
      <SettingsIntro
        title="Global branding"
        description="Applied to every direct link and data room. Each data room can override this on its own Branding tab."
      />
      <BrandingForm
        initial={
          branding
            ? {
                logoKey: branding.logoKey,
                bannerKey: branding.bannerKey,
                brandColor: branding.brandColor,
                backgroundColor: branding.backgroundColor,
                applyBgToDataroom: branding.applyBgToDataroom,
                welcomeMessage: branding.welcomeMessage,
                ctaLabel: branding.ctaLabel,
                ctaUrl: branding.ctaUrl,
                metaTitle: branding.metaTitle,
                metaDescription: branding.metaDescription,
                metaImageKey: branding.metaImageKey,
              }
            : null
        }
      />
    </div>
  );
}
