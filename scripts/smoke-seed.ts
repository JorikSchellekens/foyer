/* Seeds a user, team, document and public link for smoke-testing.
   Run: bun run scripts/smoke-seed.ts */
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument, StandardFonts } from "pdf-lib";

const db = new PrismaClient();

async function main() {
  const email = "smoke@example.com";
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Smoke Test" },
  });
  const team = await db.team.upsert({
    where: { slug: "smoke-team" },
    update: {},
    create: { name: "Smoke Team", slug: "smoke-team" },
  });
  await db.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
    update: {},
    create: { teamId: team.id, userId: user.id, role: "OWNER" },
  });

  // a real 3-page PDF
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  for (let i = 1; i <= 3; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Smoke test document, page ${i}`, {
      x: 60,
      y: 760,
      size: 24,
      font,
    });
  }
  const bytes = await pdf.save();

  const s3 = new S3Client({
    region: "us-east-1",
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9002",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "foyer",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "foyer-secret",
    },
  });
  const key = `${team.id}/smoketest01/smoke.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET ?? "foyer",
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: "application/pdf",
    })
  );

  const existingDoc = await db.document.findFirst({
    where: { teamId: team.id, name: "Smoke PDF" },
  });
  let docId = existingDoc?.id;
  if (!docId) {
    const doc = await db.document.create({
      data: {
        teamId: team.id,
        name: "Smoke PDF",
        type: "PDF",
        versions: {
          create: {
            versionNumber: 1,
            fileKey: key,
            fileName: "smoke.pdf",
            fileSize: bytes.length,
            contentType: "application/pdf",
            numPages: 3,
            uploadedById: user.id,
          },
        },
      },
      include: { versions: true },
    });
    await db.document.update({
      where: { id: doc.id },
      data: { currentVersionId: doc.versions[0].id },
    });
    docId = doc.id;
  }

  const link = await db.link.upsert({
    where: { domainId_slug: { domainId: null as never, slug: "smoketest" } },
    update: {},
    create: {
      teamId: team.id,
      target: "DOCUMENT",
      documentId: docId,
      name: "Smoke link",
      slug: "smoketest",
      accessMode: "PUBLIC",
      notifyOnAccess: false,
    },
  }).catch(async () => {
    const existing = await db.link.findFirst({ where: { slug: "smoketest" } });
    return (
      existing ??
      db.link.create({
        data: {
          teamId: team.id,
          target: "DOCUMENT",
          documentId: docId!,
          name: "Smoke link",
          slug: "smoketest",
          accessMode: "PUBLIC",
          notifyOnAccess: false,
        },
      })
    );
  });

  await db.verificationToken.deleteMany({ where: { token: "smoke-login-token" } });
  await db.verificationToken.create({
    data: {
      token: "smoke-login-token",
      purpose: "LOGIN",
      email,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });

  console.log(
    JSON.stringify({ userId: user.id, teamId: team.id, docId, linkSlug: link.slug })
  );
}

main().finally(() => db.$disconnect());
