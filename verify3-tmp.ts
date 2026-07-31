import { chromium } from "playwright";
const BASE = "https://foyer-review.mempoolsurfer.com";
const b = await chromium.launch();
const seed = await b.newPage();
await seed.goto(`${BASE}/api/demo-login`, { waitUntil: "networkidle" });
const state = await seed.context().storageState();
await seed.close();

const routes = ["/dashboard","/documents","/datarooms","/links","/signatures","/visitors",
  "/settings","/settings/branding","/settings/domains","/settings/members",
  "/settings/notifications","/settings/presets","/settings/previews","/settings/tokens",
  "/settings/webhooks","/settings/agreements","/settings/import"];
let bad = 0;
for (const r of routes) {
  const errs: string[] = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, storageState: state });
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 90)));
  const res = await p.goto(BASE + r, { waitUntil: "networkidle", timeout: 45000 });
  await p.waitForTimeout(1000);
  if (errs.length || res?.status() !== 200) bad++;
  console.log(String(res?.status()).padEnd(4), r.padEnd(26), errs.length ? "ERR " + errs[0] : "clean");
  await p.close();
}
// deep routes
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, storageState: state });
const deepErrs: string[] = [];
p.on("pageerror", (e) => deepErrs.push(String(e).slice(0, 90)));
await p.goto(BASE + "/documents", { waitUntil: "networkidle" });
const doc = await p.locator('table a[href^="/documents/"]').first().getAttribute("href");
await p.goto(BASE + doc!, { waitUntil: "networkidle", timeout: 45000 });
console.log("doc detail:", deepErrs.length ? "ERR " + deepErrs[0] : "clean");
await p.goto(BASE + "/datarooms", { waitUntil: "networkidle" });
const room = await p.locator('a[href^="/datarooms/"]').first().getAttribute("href");
await p.goto(BASE + room!, { waitUntil: "networkidle", timeout: 45000 });
console.log("dataroom:  ", deepErrs.length ? "ERR " + deepErrs[0] : "clean");
await p.goto(BASE + "/visitors", { waitUntil: "networkidle" });
const vis = await p.locator('a[href^="/visitors/"]').first().getAttribute("href");
if (vis) { await p.goto(BASE + vis, { waitUntil: "networkidle", timeout: 45000 }); }
console.log("visitor:   ", deepErrs.length ? "ERR " + deepErrs[0] : "clean");
await b.close();
console.log(bad === 0 && deepErrs.length === 0 ? "\nALL CLEAN" : `\n${bad} route(s) with issues`);
