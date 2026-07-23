/* End-to-end check of the e-signing loop: draft -> place fields -> send ->
   two signers sign via their emailed token links -> completed PDF stamped,
   certificated, and hashed. Seeds its own fixtures (team "sign-team", user
   sign@example.com), drives real Chromium via Playwright, asserts against the
   database and the produced PDF.

   Needs the dev stack running with server output captured to a file, and
   RESEND_API_KEY unset so emails are logged:
     docker compose -f docker-compose.dev.yml up -d
     RESEND_API_KEY= bun dev > /tmp/foyer-dev.log 2>&1 &
     bun run scripts/sign-e2e.ts /tmp/foyer-dev.log
*/
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const DEV_LOG = process.argv[2];
if (!DEV_LOG) {
  console.error("usage: bun run scripts/sign-e2e.ts <dev-server-log-file>");
  process.exit(1);
}
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const db = new PrismaClient();
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${label}: ${ok ? "PASS" : `FAIL ${detail}`}`);
}

/** Byte offset of the log right now; harvest only what lands after it. */
function logMark(): number {
  return readFileSync(DEV_LOG, "utf8").length;
}

function logLinks(re: RegExp, from: number): string[] {
  return [...readFileSync(DEV_LOG, "utf8").slice(from).matchAll(re)].map(
    (m) => m[1]
  );
}

async function waitForLinks(
  re: RegExp,
  count: number,
  from: number
): Promise<string[]> {
  for (let i = 0; i < 40; i++) {
    const links = [...new Set(logLinks(re, from))];
    if (links.length >= count) return links;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`expected ${count} links matching ${re} in dev log`);
}

async function makeFixturePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([612, 792]); // portrait letter
  p1.drawText("Consulting Agreement - page 1 (portrait)", {
    x: 60,
    y: 720,
    size: 16,
    font,
  });
  const p2 = doc.addPage([792, 612]); // landscape
  p2.drawText("Signature page - page 2 (landscape)", {
    x: 60,
    y: 540,
    size: 16,
    font,
  });
  return doc.save();
}

async function seed() {
  const user = await db.user.upsert({
    where: { email: "sign@example.com" },
    update: {},
    create: { email: "sign@example.com", name: "Sign Test" },
  });
  const team = await db.team.upsert({
    where: { slug: "sign-team" },
    update: {},
    create: { name: "Sign Team", slug: "sign-team" },
  });
  await db.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
    update: {},
    create: { teamId: team.id, userId: user.id, role: "OWNER" },
  });
  await db.signatureRequest.deleteMany({ where: { teamId: team.id } });
  await db.document.deleteMany({ where: { teamId: team.id } });

  const pdfBytes = await makeFixturePdf();
  const fileKey = `${team.id}/e2e/sign-fixture.pdf`;
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET ?? "foyer",
      Key: fileKey,
      Body: pdfBytes,
      ContentType: "application/pdf",
    })
  );

  const doc = await db.document.create({
    data: {
      teamId: team.id,
      name: "Consulting Agreement",
      type: "PDF",
      versions: {
        create: {
          versionNumber: 1,
          fileKey,
          fileName: "consulting-agreement.pdf",
          fileSize: pdfBytes.length,
          contentType: "application/pdf",
          numPages: 2,
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
  return { team, doc };
}

async function login(page: Page) {
  const mark = logMark();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "sign@example.com");
  await page.click('button[type="submit"]');
  const links = await waitForLinks(/\[email:dev\] link: (\S+)/g, 1, mark);
  await page.goto(links[0]);
  await page.waitForLoadState("networkidle");
}

/** Click at a fractional position inside a rendered PDF page. Locator clicks
 * auto-scroll, so pages below the fold work too. */
async function clickOnPage(page: Page, pageNum: number, fx: number, fy: number) {
  const el = page.locator(`[data-sign-page="${pageNum}"]`);
  await el.scrollIntoViewIfNeeded();
  const box = (await el.boundingBox())!;
  await el.click({ position: { x: box.width * fx, y: box.height * fy } });
}

async function addRecipient(page: Page, email: string) {
  await page.fill('input[placeholder="signer@company.com"]', email);
  await page.keyboard.press("Enter");
  await page.waitForSelector(`button:has-text("${email}")`);
}

async function placeField(
  page: Page,
  kind: string,
  pageNum: number,
  fx: number,
  fy: number
) {
  await page.click(`[data-palette="${kind}"]`);
  await clickOnPage(page, pageNum, fx, fy);
}

async function signAs(
  browserContextUrl: string,
  typedName: string,
  textValue: string | null
) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(browserContextUrl);
  await page.waitForSelector("text=requests your signature");
  await page.waitForSelector('[data-sign-field]');

  // adopt via a signature box
  await page.locator('button:has-text("Sign here")').first().click();
  await page.waitForSelector("text=Adopt your signature");
  await page.fill('input[placeholder="Your full name"]', typedName);
  await page.click('button:has-text("Adopt and apply")');

  if (textValue !== null) {
    await page.fill('[data-sign-kind="TEXT"] input', textValue);
  }

  await page.click("#esign-consent");
  await page.click('[data-testid="finish"]');
  try {
    await page.waitForSelector("text=/You have signed|Everyone has signed/", {
      timeout: 20_000,
    });
  } catch (e) {
    console.log(`  DEBUG (${typedName}) body:`, (await page.textContent("body"))?.slice(0, 400));
    console.log(`  DEBUG (${typedName}) errors:`, errors.slice(0, 5));
    throw e;
  }
  if (errors.length) console.log(`  page errors (${typedName}):`, errors.slice(0, 3));
  await browser.close();
}

async function main() {
  const fx = await seed();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await login(page);

  // ---- create draft from the document page ----
  await page.goto(`${BASE}/documents/${fx.doc.id}`);
  await page.click('button:has-text("Request signatures")');
  await page.waitForURL(/\/signatures\/\w+/);
  const requestId = page.url().split("/signatures/")[1];
  check("draft created", !!requestId);

  // ---- recipients ----
  await addRecipient(page, "signer-one@example.com");
  await addRecipient(page, "signer-two@example.com");
  const signerOne = await db.signer.findFirst({
    where: { requestId, email: "signer-one@example.com" },
  });
  const signerTwo = await db.signer.findFirst({
    where: { requestId, email: "signer-two@example.com" },
  });
  check("signers persisted", !!signerOne && !!signerTwo);

  // ---- place fields: signer one on portrait page 1, signer two on landscape page 2 ----
  await page.waitForSelector('[data-sign-page="2"]');
  // signer-two is active (last added); place their signature on the landscape page
  await placeField(page, "SIGNATURE", 2, 0.55, 0.7);
  // switch to signer one, place signature + date + text on page 1
  await page.click('button:has-text("signer-one@example.com")');
  await placeField(page, "SIGNATURE", 1, 0.15, 0.75);
  await placeField(page, "DATE_SIGNED", 1, 0.15, 0.85);
  await placeField(page, "TEXT", 1, 0.55, 0.75);

  check(
    "4 fields on canvas",
    (await page.locator("[data-sign-field]").count()) === 4,
    `got ${await page.locator("[data-sign-field]").count()}`
  );
  // Poll past the debounce + server roundtrip (slow on cold dev compiles).
  let fields: Awaited<ReturnType<typeof db.signatureField.findMany>> = [];
  for (let i = 0; i < 30 && fields.length !== 4; i++) {
    await new Promise((r) => setTimeout(r, 500));
    fields = await db.signatureField.findMany({ where: { requestId } });
  }
  check("4 fields persisted", fields.length === 4, `got ${fields.length}`);
  check(
    "field pcts sane",
    fields.every(
      (f) =>
        f.xPct >= 0 && f.xPct <= 1 && f.yPct >= 0 && f.yPct <= 1 && f.wPct > 0.01
    )
  );
  check(
    "fields split across signers",
    fields.filter((f) => f.signerId === signerOne!.id).length === 3 &&
      fields.filter((f) => f.signerId === signerTwo!.id).length === 1
  );

  // ---- send ----
  const sendMark = logMark();
  await page.click('button:has-text("Send for signature")');
  await page.waitForSelector("text=Activity", { timeout: 20_000 });
  const sent = await db.signatureRequest.findUnique({ where: { id: requestId } });
  check("request SENT", sent?.status === "SENT", `got ${sent?.status}`);
  const signLinks = await waitForLinks(
    /\[email:dev\] link: (\S+\/sign\/t\/\S+)/g,
    2,
    sendMark
  );
  check("2 invite links emailed", signLinks.length >= 2, `got ${signLinks.length}`);

  // map links to signers via tokens
  const s1 = (await db.signer.findFirst({
    where: { requestId, email: "signer-one@example.com" },
  }))!;
  const s2 = (await db.signer.findFirst({
    where: { requestId, email: "signer-two@example.com" },
  }))!;
  const linkFor = (token: string) => signLinks.find((l) => l.endsWith(token))!;
  check("links carry fresh tokens", !!linkFor(s1.token) && !!linkFor(s2.token));

  // ---- both signers sign in fresh browser contexts ----
  await signAs(linkFor(s1.token), "Signer One", "Chief Example Officer");
  const afterOne = await db.signatureRequest.findUnique({ where: { id: requestId } });
  check("still SENT after first signer", afterOne?.status === "SENT");
  await signAs(linkFor(s2.token), "Signer Two", null);

  // ---- completion asserts ----
  const done = await db.signatureRequest.findUnique({ where: { id: requestId } });
  check("request COMPLETED", done?.status === "COMPLETED", `got ${done?.status}`);
  check("signedFileKey set", !!done?.signedFileKey);
  check("finalHash set", /^[0-9a-f]{64}$/.test(done?.finalHash ?? ""));

  const events = (
    await db.signingEvent.findMany({
      where: { requestId },
      orderBy: { createdAt: "asc" },
    })
  ).map((e) => e.type);
  const expectSeq = ["sent", "viewed", "consented", "signed", "completed"];
  check(
    "event trail complete",
    expectSeq.every((t) => events.includes(t)) &&
      events.filter((t) => t === "signed").length === 2,
    `got ${events.join(",")}`
  );

  // ---- fetch the completed PDF as the team and verify bytes ----
  const res = await page.request.get(
    `${BASE}/api/sign/completed/${requestId}?download=1`
  );
  check("completed PDF downloads", res.ok(), `status ${res.status()}`);
  const bytes = Buffer.from(await res.body());
  check(
    "bytes match finalHash",
    createHash("sha256").update(bytes).digest("hex") === done?.finalHash
  );
  const finalPdf = await PDFDocument.load(bytes);
  check(
    "certificate page appended",
    finalPdf.getPageCount() >= 3,
    `pages=${finalPdf.getPageCount()}`
  );

  // ---- upload-first entry: PNG uploaded on /signatures, rendered to PDF ----
  const sharp = (await import("sharp")).default;
  const pngBytes = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 250, g: 250, b: 248 },
    },
  })
    .png()
    .toBuffer();
  await page.goto(`${BASE}/signatures`);
  await page.click('button:has-text("Upload & request signatures")');
  await page.setInputFiles('input[type="file"][accept]', {
    name: "site-photo.png",
    mimeType: "image/png",
    buffer: pngBytes,
  });
  await page.waitForURL(/\/signatures\/\w+$/, { timeout: 30_000 });
  const imgRequestId = page.url().split("/signatures/")[1];
  const imgRequest = await db.signatureRequest.findUnique({
    where: { id: imgRequestId },
    include: { version: true },
  });
  check(
    "upload draft has PDF rendition",
    !!imgRequest?.pdfKey && imgRequest.pdfKey !== imgRequest.version.fileKey
  );

  await addRecipient(page, "photo-signer@example.com");
  await page.waitForSelector('[data-sign-page="1"]');
  await placeField(page, "SIGNATURE", 1, 0.3, 0.6);
  await page.waitForSelector("[data-sign-field]");
  for (
    let i = 0;
    i < 30 &&
    (await db.signatureField.count({ where: { requestId: imgRequestId } })) < 1;
    i++
  )
    await new Promise((r) => setTimeout(r, 500));
  const imgSendMark = logMark();
  await page.click('button:has-text("Send for signature")');
  await page.waitForSelector("text=Activity", { timeout: 20_000 });
  const [imgLink] = await waitForLinks(
    /\[email:dev\] link: (\S+\/sign\/t\/\S+)/g,
    1,
    imgSendMark
  );
  await signAs(imgLink, "Photo Signer", null);
  const imgDone = await db.signatureRequest.findUnique({
    where: { id: imgRequestId },
  });
  check("image request COMPLETED", imgDone?.status === "COMPLETED");
  const imgRes = await page.request.get(
    `${BASE}/api/sign/completed/${imgRequestId}?download=1`
  );
  const imgFinal = await PDFDocument.load(Buffer.from(await imgRes.body()));
  check(
    "image final = image page + certificate",
    imgFinal.getPageCount() === 2,
    `pages=${imgFinal.getPageCount()}`
  );

  // ---- text rendition to draft stage ----
  await page.goto(`${BASE}/signatures`);
  await page.click('button:has-text("Upload & request signatures")');
  await page.setInputFiles('input[type="file"][accept]', {
    name: "terms.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      `# Terms of Engagement\n\n${"These terms govern the engagement between the parties. ".repeat(40)}\n\nSigned below.`
    ),
  });
  await page.waitForURL(/\/signatures\/\w+$/, { timeout: 30_000 });
  const txtRequestId = page.url().split("/signatures/")[1];
  const txtRequest = await db.signatureRequest.findUnique({
    where: { id: txtRequestId },
    include: { version: true },
  });
  check(
    "text draft has PDF rendition",
    !!txtRequest?.pdfKey && txtRequest.pdfKey !== txtRequest.version.fileKey
  );
  const txtFile = await page.request.get(
    `${BASE}/api/signatures/file/${txtRequestId}`
  );
  const txtPdf = await PDFDocument.load(Buffer.from(await txtFile.body()));
  check("text rendition is a valid PDF", txtPdf.getPageCount() >= 1);

  if (errors.length) console.log("page errors:", errors.slice(0, 5));
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main()
  .catch((e) => {
    console.error("E2E error:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
