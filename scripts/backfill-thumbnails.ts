/* Backfill precomputed page thumbnails for existing PDF versions.
   Idempotent: skips pages already built. Run: bun run scripts/backfill-thumbnails.ts */
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { renderPdfPagesWebp } from "../src/lib/pdf-render";

const db = new PrismaClient();
const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});
const BUCKET = process.env.S3_BUCKET ?? "foyer";
const thumbKey = (v: string, p: number) => `thumbnails/${v}/${p}.webp`;

async function exists(key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const versions = await db.documentVersion.findMany({
    where: { document: { type: "PDF" }, fileKey: { not: null } },
    select: { id: true, fileKey: true, numPages: true },
    orderBy: { id: "asc" },
  });
  console.log(`${versions.length} PDF versions to check`);
  let built = 0;
  let skipped = 0;

  for (const v of versions) {
    // which pages are missing?
    let pages: number[] | null = null;
    if (v.numPages && v.numPages > 0) {
      const missing: number[] = [];
      for (let p = 1; p <= v.numPages; p++)
        if (!(await exists(thumbKey(v.id, p)))) missing.push(p);
      if (missing.length === 0) {
        skipped++;
        continue;
      }
      pages = missing;
    }

    const obj = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: v.fileKey! })
    );
    const pdf = Buffer.from(await obj.Body!.transformToByteArray());
    let n = 0;
    for await (const { page, webp } of renderPdfPagesWebp(pdf, pages)) {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: thumbKey(v.id, page),
          Body: webp,
          ContentType: "image/webp",
        })
      );
      n++;
    }
    built++;
    console.log(`  ${v.id}: ${n} pages`);
  }
  console.log(`Done. ${built} versions built, ${skipped} already complete.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
