/* Link documents, end to end: an admin adds a link from the library and from
   a data room (a javascript: URL is refused), the document page offers "Open
   link" instead of Preview; a visitor sees the link in the room index with
   its domain, opening it lands on the URL in a new tab and records a view,
   prev/next skips it, and a share link pointing at it redirects.

   Needs the dev stack and a dev server logging magic links, e.g.:
     docker compose -f docker-compose.dev.yml up -d
     RESEND_API_KEY= NEXT_PUBLIC_APP_URL=http://localhost:3216 bunx next dev -p 3216 > /tmp/foyer-dev.log 2>&1 &
     LOG=/tmp/foyer-dev.log OUT=/tmp/foyer-shots bun run scripts/link-e2e.ts
*/
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFileSync } from "fs";
const db = new PrismaClient(); const BASE = process.env.APP_URL ?? "http://localhost:3216"; const LOG = process.env.LOG ?? "/tmp/foyer-dev.log"; const OUT = process.env.OUT ?? "/tmp/foyer-shots";
const s3 = new S3Client({ region: "us-east-1", endpoint: "http://localhost:9002", forcePathStyle: true, credentials: { accessKeyId: "foyer", secretAccessKey: "foyer-secret" } });
let fails = 0; const check = (l: string, ok: boolean, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? ` (${d})` : ""}`); };
async function seed() {
  const email = "linkadmin@example.com";
  const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
  const team = await db.team.upsert({ where: { slug: "link-team" }, update: {}, create: { name: "Link Team", slug: "link-team" } });
  await db.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId: user.id } }, update: {}, create: { teamId: team.id, userId: user.id, role: "OWNER" } });
  await db.link.deleteMany({ where: { teamId: team.id } }); await db.dataroom.deleteMany({ where: { teamId: team.id } }); await db.document.deleteMany({ where: { teamId: team.id } });
  const pdf = await PDFDocument.create(); const f = await pdf.embedFont(StandardFonts.Helvetica); pdf.addPage([595, 842]).drawText("A real PDF", { x: 60, y: 760, size: 24, font: f });
  const bytes = await pdf.save(); const key = `${team.id}/lk/real.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: "foyer", Key: key, Body: Buffer.from(bytes), ContentType: "application/pdf" }));
  const doc = await db.document.create({ data: { teamId: team.id, name: "Real PDF", type: "PDF", versions: { create: { versionNumber: 1, fileKey: key, fileName: "real.pdf", fileSize: bytes.length, contentType: "application/pdf", numPages: 1, uploadedById: user.id } } }, include: { versions: true } });
  await db.document.update({ where: { id: doc.id }, data: { currentVersionId: doc.versions[0].id } });
  const room = await db.dataroom.create({ data: { teamId: team.id, name: "Link Room" } });
  const pdfItem = await db.dataroomDocument.create({ data: { dataroomId: room.id, documentId: doc.id, orderIndex: 0 } });
  await db.link.create({ data: { teamId: team.id, target: "DATAROOM", dataroomId: room.id, name: "room", slug: "lk-room", accessMode: "PUBLIC", notifyOnAccess: false } });
  return { email, team, room, pdfItem };
}
async function login(page: Page, email: string) {
  const before = [...readFileSync(LOG, "utf8").matchAll(/\[email:dev\] link: /g)].length;
  await page.goto(`${BASE}/login`); await page.fill('input[type="email"]', email); await page.click('button[type="submit"]');
  for (let i = 0; i < 60; i++) { const m = [...readFileSync(LOG, "utf8").matchAll(/\[email:dev\] link: (\S+)/g)]; if (m.length > before) { await page.goto(m[m.length - 1][1]); await page.waitForLoadState("networkidle"); return; } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("no magic link");
}
(async () => {
  const { email, team, room, pdfItem } = await seed();
  const browser = await chromium.launch();
  try {
    // ---- admin
    const admin = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
    await login(admin, email);
    await admin.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
    await admin.getByRole("button", { name: "Add link" }).click();
    await admin.fill("#link-url", "example.com/deck"); await admin.fill("#link-name", "Example deck");
    await admin.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
    await admin.getByText("Example deck").first().waitFor({ timeout: 15000 });
    const libDoc = await db.document.findFirst({ where: { teamId: team.id, name: "Example deck" } });
    check("library: link document created", libDoc?.type === "LINK" && libDoc.externalUrl === "https://example.com/deck", `${libDoc?.type} ${libDoc?.externalUrl}`);
    await admin.screenshot({ path: `${OUT}/admin-library.png` });
    await admin.goto(`${BASE}/documents/${libDoc!.id}`, { waitUntil: "networkidle" });
    const open = admin.getByRole("link", { name: "Open link" });
    check("doc page: Open link instead of Preview", (await open.count()) === 1 && (await open.getAttribute("href")) === "https://example.com/deck" && (await admin.locator(`a[href="/documents/${libDoc!.id}/preview"]`).count()) === 0);
    await admin.screenshot({ path: `${OUT}/admin-docpage.png` });
    // bad URL is refused
    await admin.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
    await admin.getByRole("button", { name: "Add link" }).click();
    await admin.fill("#link-url", "javascript:alert(1)");
    await admin.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
    await admin.getByText("Only http and https links are supported.").waitFor({ timeout: 10000 }).then(() => check("javascript: URL refused", true), () => check("javascript: URL refused", false));
    await admin.keyboard.press("Escape");
    await admin.goto(`${BASE}/datarooms/${room.id}`, { waitUntil: "networkidle" });
    await admin.getByRole("button", { name: "Add link" }).click();
    await admin.fill("#dr-link-url", "https://example.org/");
    await admin.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
    await admin.waitForTimeout(2500);
    const drDoc = await db.document.findFirst({ where: { teamId: team.id, externalUrl: "https://example.org/" }, include: { dataroomDocs: true } });
    check("data room: link added with default name", drDoc?.type === "LINK" && drDoc.name === "example.org" && drDoc.dataroomDocs.length === 1, `${drDoc?.name}`);
    await admin.screenshot({ path: `${OUT}/admin-dataroom.png` });

    // ---- visitor
    const vctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const v = await vctx.newPage();
    await v.goto(`${BASE}/view/lk-room`, { waitUntil: "networkidle" });
    const row = v.getByRole("link", { name: /example\.org ↗/ }).first();
    check("index: link listed with domain", (await row.count()) > 0 && /example\.org ↗/.test((await row.textContent()) ?? ""));
    check("index: opens in new tab", (await row.getAttribute("target")) === "_blank");
    await v.screenshot({ path: `${OUT}/visitor-index.png` });
    const viewsBefore = await db.view.count({ where: { documentId: drDoc!.id } });
    const [popup] = await Promise.all([vctx.waitForEvent("page"), row.click()]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    check("click: new tab lands on the URL", popup.url().startsWith("https://example.org"), popup.url());
    check("click: index stays in place", v.url().endsWith("/view/lk-room"));
    await new Promise((r) => setTimeout(r, 800));
    const viewsAfter = await db.view.count({ where: { documentId: drDoc!.id } });
    check("click: view recorded", viewsAfter === viewsBefore + 1, `${viewsBefore} -> ${viewsAfter}`);
    await v.goto(`${BASE}/view/lk-room/d/${pdfItem.id}`, { waitUntil: "networkidle" });
    const pos = await v.getByText(/\d+ \/ \d+/).first().textContent().catch(() => "");
    check("prev/next skips links", (pos ?? "").replace(/\s/g, "") === "1/1", pos ?? "");
    const treeLink = v.locator(`a[href*="/d/"][target="_blank"]`);
    check("sidebar: link item opens in new tab", (await treeLink.count()) >= 1);
    // direct share link to a link document
    await db.link.create({ data: { teamId: team.id, target: "DOCUMENT", documentId: libDoc!.id, name: "d", slug: "lk-direct", accessMode: "PUBLIC", notifyOnAccess: false } });
    const res = await fetch(`${BASE}/view/lk-direct`, { redirect: "manual" });
    check("direct link redirects to the URL", res.status >= 300 && res.status < 400 && res.headers.get("location") === "https://example.com/deck", `${res.status} ${res.headers.get("location")}`);
  } finally { await browser.close(); await db.$disconnect(); }
  console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
})();
