import { chromium } from "playwright";
const BASE = "https://foyer-review.mempoolsurfer.com";
const b = await chromium.launch();
const seed = await b.newPage();
await seed.goto(`${BASE}/api/demo-login`, { waitUntil: "networkidle" });
const state = await seed.context().storageState();
await seed.close();
const routes = ["/dashboard","/documents","/datarooms","/links","/signatures","/visitors",
  "/settings","/settings/branding","/settings/domains","/settings/members","/settings/notifications",
  "/settings/presets","/settings/previews","/settings/tokens","/settings/webhooks",
  "/settings/agreements","/settings/import"];
let issues = 0;
for (const r of routes) {
  let line = r.padEnd(26);
  for (let i = 0; i < 2; i++) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 }, storageState: state });
    const errs: string[] = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 60)));
    const res = await p.goto(BASE + r, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForTimeout(900);
    const ok = res?.status() === 200 && errs.length === 0;
    if (!ok) issues++;
    line += ok ? " ok" : ` [${res?.status()}${errs[0] ? " " + errs[0] : ""}]`;
    await p.close();
  }
  console.log(line);
}
console.log(issues === 0 ? "\nALL ROUTES CLEAN (2 passes each)" : `\n${issues} issue(s)`);
await b.close();
