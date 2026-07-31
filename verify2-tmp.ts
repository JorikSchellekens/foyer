import { chromium } from "playwright";
const BASE = "https://foyer-review.mempoolsurfer.com";
const b = await chromium.launch();
const routes = ["/dashboard","/documents","/datarooms","/links","/signatures","/visitors","/settings"];
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/api/demo-login`, { waitUntil: "networkidle" });
for (const r of routes) {
  const errs: string[] = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, storageState: await page.context().storageState() });
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await p.goto(BASE + r, { waitUntil: "networkidle", timeout: 45000 });
  await p.waitForTimeout(1200);
  console.log(r.padEnd(14), errs.length ? "HYDRATION/ERR: " + errs[0] : "clean");
  await p.close();
}
await b.close();
