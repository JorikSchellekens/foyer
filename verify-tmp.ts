import { chromium } from "playwright";
const BASE = "https://foyer-review.mempoolsurfer.com";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(`${BASE}/api/demo-login`, { waitUntil: "networkidle" });
const routes = ["/dashboard","/documents","/datarooms","/links","/signatures","/visitors",
  "/settings","/settings/branding","/settings/domains","/settings/notifications","/settings/webhooks"];
for (const r of routes) {
  const res = await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 45000 });
  const h = await page.locator("h1").first().textContent().catch(() => null);
  console.log(`${String(res?.status()).padEnd(4)} ${r.padEnd(26)} h1=${JSON.stringify((h||"").trim().slice(0,40))}`);
}
// deep pages
await page.goto(BASE + "/documents", { waitUntil: "networkidle" });
const firstDoc = page.locator('table a[href^="/documents/"]').first();
const href = await firstDoc.getAttribute("href");
if (href) {
  const r = await page.goto(BASE + href, { waitUntil: "networkidle", timeout: 45000 });
  console.log(`${r?.status()} ${href} (document detail)`);
}
await page.goto(BASE + "/datarooms", { waitUntil: "networkidle" });
const room = await page.locator('a[href^="/datarooms/"]').first().getAttribute("href");
if (room) {
  const r = await page.goto(BASE + room, { waitUntil: "networkidle", timeout: 45000 });
  console.log(`${r?.status()} ${room} (dataroom)`);
}
console.log("\npage errors:", errors.length ? errors.slice(0, 8) : "none");
await b.close();
