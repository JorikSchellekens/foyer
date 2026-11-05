/* Internal data room preview, end to end: on a room with no access links,
   the admin header offers Preview (new tab); the preview lists every item
   under the preview strip with no downloads or Q&A; a PDF opens in the
   visitor viewer with prev/next through the room (links skipped); a link
   item redirects; nothing is recorded; logged-out visitors are sent to login
   and a member without access to the room gets a 404.

   Needs the dev stack and a dev server logging magic links, e.g.:
     docker compose -f docker-compose.dev.yml up -d
     RESEND_API_KEY= NEXT_PUBLIC_APP_URL=http://localhost:3218 bunx next dev -p 3218 > /tmp/foyer-dev.log 2>&1 &
     LOG=/tmp/foyer-dev.log OUT=/tmp/foyer-shots bun run scripts/dataroom-preview-e2e.ts
*/
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFileSync } from "fs";
const db = new PrismaClient(); const BASE = process.env.APP_URL ?? "http://localhost:3218"; const LOG = process.env.LOG ?? "/tmp/foyer-dev.log"; const OUT = process.env.OUT ?? "/tmp/foyer-shots";
const s3 = new S3Client({ region: "us-east-1", endpoint: "http://localhost:9002", forcePathStyle: true, credentials: { accessKeyId: "foyer", secretAccessKey: "foyer-secret" } });
let fails = 0; const check = (l: string, ok: boolean, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? ` (${d})` : ""}`); };
async function pdfDoc(teamId: string, userId: string, name: string) {
  const pdf = await PDFDocument.create(); const f = await pdf.embedFont(StandardFonts.Helvetica); pdf.addPage([595, 842]).drawText(name, { x: 60, y: 760, size: 28, font: f });
  const bytes = await pdf.save(); const key = `${teamId}/drp/${name.replace(/\W/g, "")}.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: "foyer", Key: key, Body: Buffer.from(bytes), ContentType: "application/pdf" }));
  const d = await db.document.create({ data: { teamId, name, type: "PDF", versions: { create: { versionNumber: 1, fileKey: key, fileName: `${name}.pdf`, fileSize: bytes.length, contentType: "application/pdf", numPages: 1, uploadedById: userId } } }, include: { versions: true } });
  await db.document.update({ where: { id: d.id }, data: { currentVersionId: d.versions[0].id } }); return d;
}
async function login(page: Page, email: string) {
  const before = [...readFileSync(LOG, "utf8").matchAll(/\[email:dev\] link: /g)].length;
  await page.goto(`${BASE}/login`); await page.fill('input[type="email"]', email); await page.click('button[type="submit"]');
  for (let i = 0; i < 60; i++) { const m = [...readFileSync(LOG, "utf8").matchAll(/\[email:dev\] link: (\S+)/g)]; if (m.length > before) { await page.goto(m[m.length - 1][1]); await page.waitForLoadState("networkidle"); return; } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("no magic link");
}
(async () => {
  const team = await db.team.upsert({ where: { slug: "drp-team" }, update: {}, create: { name: "Preview Team", slug: "drp-team" } });
  const users: Record<string, string> = {};
  for (const [email, role] of [["drp-owner@example.com", "OWNER"], ["drp-member@example.com", "MEMBER"]] as const) {
    const u = await db.user.upsert({ where: { email }, update: {}, create: { email } }); users[role] = u.id;
    await db.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId: u.id } }, update: { role }, create: { teamId: team.id, userId: u.id, role } });
  }
  await db.link.deleteMany({ where: { teamId: team.id } }); await db.dataroom.deleteMany({ where: { teamId: team.id } }); await db.document.deleteMany({ where: { teamId: team.id } });
  const room = await db.dataroom.create({ data: { teamId: team.id, name: "Preview Room" } });
  const other = await db.dataroom.create({ data: { teamId: team.id, name: "Other Room" } });
  const member = await db.teamMember.findFirst({ where: { teamId: team.id, role: "MEMBER" } });
  await db.resourcePermission.deleteMany({ where: { memberId: member!.id } });
  await db.resourcePermission.create({ data: { memberId: member!.id, resourceType: "DATAROOM", resourceId: other.id, level: "VIEW" } });
  const a = await pdfDoc(team.id, users.OWNER, "Alpha Memo");
  const b = await pdfDoc(team.id, users.OWNER, "Beta Deck");
  const lnk = await db.document.create({ data: { teamId: team.id, name: "Company site", type: "LINK", externalUrl: "https://example.org/" } });
  const folder = await db.dataroomFolder.create({ data: { dataroomId: room.id, name: "Finance", orderIndex: 2 } });
  const ia = await db.dataroomDocument.create({ data: { dataroomId: room.id, documentId: a.id, orderIndex: 0 } });
  await db.dataroomDocument.create({ data: { dataroomId: room.id, documentId: lnk.id, orderIndex: 1 } });
  const ib = await db.dataroomDocument.create({ data: { dataroomId: room.id, documentId: b.id, folderId: folder.id, orderIndex: 0 } });
  const viewsBefore = await db.view.count({ where: { document: { teamId: team.id } } });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const p = await ctx.newPage();
    await login(p, "drp-owner@example.com");
    await p.goto(`${BASE}/datarooms/${room.id}`, { waitUntil: "networkidle" });
    const btn = p.getByRole("link", { name: "Preview" }).first();
    check("admin header: Preview button, new tab", (await btn.getAttribute("href")) === `/datarooms/${room.id}/preview` && (await btn.getAttribute("target")) === "_blank");
    await p.screenshot({ path: `${OUT}/admin-header.png`, clip: { x: 0, y: 0, width: 1280, height: 160 } });
    await p.goto(`${BASE}/datarooms/${room.id}/preview`, { waitUntil: "networkidle" });
    const text = await p.locator("body").innerText();
    check("preview: banner", text.includes("Internal look at the whole data room"));
    check("preview: all items listed (no access link exists)", ["Alpha Memo", "Company site", "Beta Deck", "Finance"].every((t) => text.includes(t)));
    check("preview: no downloads / Q&A", !/Download all/.test(text));
    const alpha = p.getByRole("link", { name: /Alpha Memo/ }).last();
    check("preview: items point at preview pages", (await alpha.getAttribute("href")) === `/datarooms/${room.id}/preview/d/${ia.id}`);
    const site = p.getByRole("link", { name: /example\.org/ }).first();
    check("preview: link item opens in new tab", (await site.getAttribute("target")) === "_blank");
    await p.screenshot({ path: `${OUT}/preview-index.png` });
    await alpha.click(); await p.waitForURL(`**/preview/d/${ia.id}`); await p.waitForSelector("[data-track-page] canvas", { timeout: 30000 });
    const vt = await p.locator("body").innerText();
    check("item: PDF renders with banner", vt.includes("Internal look at the whole data room"));
    check("item: position skips the link (1 / 2)", /1\s*\/\s*2/.test(vt));
    await p.screenshot({ path: `${OUT}/preview-item.png` });
    const next = p.locator(`a[href="/datarooms/${room.id}/preview/d/${ib.id}"]`);
    check("item: next goes to Beta Deck in preview", (await next.count()) > 0);
    const r = await fetch(`${BASE}/datarooms/${room.id}/preview/d/${(await db.dataroomDocument.findFirst({ where: { documentId: lnk.id } }))!.id}`, { redirect: "manual", headers: { cookie: (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") } });
    check("link item redirects to the URL", r.status >= 300 && r.status < 400 && r.headers.get("location") === "https://example.org/", `${r.status} ${r.headers.get("location")}`);
    check("nothing recorded", (await db.view.count({ where: { document: { teamId: team.id } } })) === viewsBefore);
    const anon = await fetch(`${BASE}/datarooms/${room.id}/preview`, { redirect: "manual" });
    check("logged out: no access", anon.status >= 300 && anon.status < 400 && /login/.test(anon.headers.get("location") ?? ""), `${anon.status} ${anon.headers.get("location")}`);
    const mp = await (await browser.newContext()).newPage(); await login(mp, "drp-member@example.com");
    const mr = await mp.goto(`${BASE}/datarooms/${room.id}/preview`);
    check("member without room access: 404", mr?.status() === 404, `${mr?.status()}`);
  } finally { await browser.close(); await db.$disconnect(); }
  console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
})();
