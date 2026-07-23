/* Probe for the adopt-signature drawing pad: seeds a SENT request directly,
   opens the real signer page, draws two separated strokes, and measures
   painted pixels after each - plus where the ink sits in the exported PNG.
     RESEND_API_KEY= bun dev > /tmp/foyer-dev.log 2>&1 &
     bun run scripts/pad-probe.ts
*/
import { chromium, webkit } from "playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { PDFDocument } from "pdf-lib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const db = new PrismaClient();

async function main() {
  const team = await db.team.upsert({
    where: { slug: "sign-team" },
    update: {},
    create: { name: "Sign Team", slug: "sign-team" },
  });
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const bytes = await pdf.save();
  const fileKey = `${team.id}/probe/pad.pdf`;
  const s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: fileKey,
      Body: bytes,
      ContentType: "application/pdf",
    })
  );
  const doc = await db.document.create({
    data: {
      teamId: team.id,
      name: "Pad Probe",
      type: "PDF",
      versions: {
        create: {
          versionNumber: 1,
          fileKey,
          fileName: "pad.pdf",
          contentType: "application/pdf",
          numPages: 1,
        },
      },
    },
    include: { versions: true },
  });
  const token = randomBytes(24).toString("base64url");
  const request = await db.signatureRequest.create({
    data: {
      teamId: team.id,
      documentId: doc.id,
      versionId: doc.versions[0].id,
      pdfKey: fileKey,
      title: "Pad Probe",
      status: "SENT",
      sentAt: new Date(),
      signers: {
        create: {
          email: "pad@example.com",
          token,
          status: "SENT",
        },
      },
    },
    include: { signers: true },
  });
  await db.signatureField.create({
    data: {
      requestId: request.id,
      signerId: request.signers[0].id,
      kind: "SIGNATURE",
      page: 1,
      xPct: 0.2,
      yPct: 0.5,
      wPct: 0.22,
      hPct: 0.05,
    },
  });

  const browser = await (process.env.ENGINE === "webkit" ? webkit : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/sign/t/${token}`);
  await page.waitForSelector('button:has-text("Sign here")');
  await page.click('button:has-text("Sign here")');
  await page.waitForSelector("text=Adopt your signature");
  await page.click('button[role="tab"]:has-text("Draw")');
  const canvas = page.locator('[role="dialog"] canvas');
  await canvas.waitFor();
  await page.waitForTimeout(400); // let any dialog animation settle

  const inkStats = () =>
    page.evaluate(() => {
      const c = document.querySelector('[role="dialog"] canvas') as HTMLCanvasElement;
      const ctx = c.getContext("2d")!;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let painted = 0;
      let minY = Infinity, maxY = -1, minX = Infinity, maxX = -1;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
          painted++;
          const p = (i - 3) / 4;
          const y = Math.floor(p / c.width);
          const x = p % c.width;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      return { painted, minX, maxX, minY, maxY, w: c.width, h: c.height, cssW: c.offsetWidth, cssH: c.offsetHeight };
    });

  const box = (await canvas.boundingBox())!;
  const stroke = async (fx1: number, fy1: number, fx2: number, fy2: number) => {
    await page.mouse.move(box.x + box.width * fx1, box.y + box.height * fy1);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(
        box.x + box.width * (fx1 + ((fx2 - fx1) * i) / 8),
        box.y + box.height * (fy1 + ((fy2 - fy1) * i) / 8)
      );
    }
    await page.mouse.up();
  };

  await stroke(0.1, 0.3, 0.5, 0.4); // stroke 1: upper-left area
  const after1 = await inkStats();
  await stroke(0.55, 0.7, 0.9, 0.6); // stroke 2: lower-right area
  const after2 = await inkStats();
  // stroke 3 BEGINS ABOVE the canvas (fast flourish / crossing a t) - the
  // historical dropped-stroke case
  await stroke(0.3, -0.06, 0.7, 0.3);
  const after3 = await inkStats();

  console.log("after stroke 1:", after1);
  console.log("after stroke 2:", after2);
  console.log("after stroke 3 (starts outside):", after3);
  console.log(
    "second stroke captured on canvas:",
    after2.painted > after1.painted * 1.5 ? "YES" : "NO"
  );
  console.log(
    "outside-start stroke captured:",
    after3.painted > after2.painted * 1.2 ? "YES" : "NO"
  );

  // What the dialog would adopt: the pad's data URL painted-extent
  const exported = await page.evaluate(() => {
    const c = document.querySelector('[role="dialog"] canvas') as HTMLCanvasElement;
    return c.toDataURL("image/png").length;
  });
  console.log("export dataURL length:", exported);
  await page.screenshot({
    path: "/private/tmp/claude-501/-Users-jorikschellekens-dev-foyer/bd6d7a06-d752-4bf7-8699-6f36a34d39c7/scratchpad/pad-after-strokes.png",
  });

  // Adopt it and screenshot the filled field box on the page
  await page.click('button:has-text("Adopt and apply")');
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "/private/tmp/claude-501/-Users-jorikschellekens-dev-foyer/bd6d7a06-d752-4bf7-8699-6f36a34d39c7/scratchpad/pad-adopted.png",
  });

  if (errors.length) console.log("page errors:", errors.slice(0, 5));
  await browser.close();
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
