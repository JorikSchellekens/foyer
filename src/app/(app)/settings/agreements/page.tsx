import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { AgreementsClient } from "./agreements-client";

export default async function AgreementsPage() {
  const ctx = await requireTeam();
  const agreements = await db.agreement.findMany({
    where: { teamId: ctx.team.id },
    include: {
      _count: { select: { responses: true, links: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AgreementsClient
      agreements={agreements.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        requireName: a.requireName,
        hasFile: !!a.fileKey,
        externalUrl: a.externalUrl,
        content: a.content,
        signatures: a._count.responses,
        links: a._count.links,
      }))}
    />
  );
}
