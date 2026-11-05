import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { canAccessDataroom } from "@/lib/permissions";
import {
  internalDataroomLink,
  INTERNAL_PREVIEW_TEXT,
} from "@/lib/internal-preview";
import { resolveBranding, gateBrand } from "@/lib/viewer-brand";
import { DataroomIndex } from "@/app/view/[slug]/dataroom-index";

/**
 * Internal look at a whole data room, as visitors see its front page: no
 * access link needed, every item visible, nothing recorded.
 */
export default async function DataroomPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTeam();
  const { id } = await params;
  if (!(await canAccessDataroom(ctx, id, "VIEW"))) notFound();
  const link = await internalDataroomLink(ctx, id);
  if (!link) notFound();

  const branding = await resolveBranding(link);
  return (
    <DataroomIndex
      link={link}
      slug=""
      branding={branding}
      brand={gateBrand(link, branding)}
      session={{ linkId: link.id }}
      viewId=""
      trackToken=""
      currentFolderId={null}
      itemHref={(itemId) => `/datarooms/${id}/preview/d/${itemId}`}
      previewText={INTERNAL_PREVIEW_TEXT}
    />
  );
}
