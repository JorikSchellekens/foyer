import { chromium } from "playwright";
const BASE = "https://foyer-review.mempoolsurfer.com";
const b = await chromium.launch();
const seed = await b.newPage();
await seed.goto(`${BASE}/api/demo-login`, { waitUntil: "networkidle" });
const state = await seed.context().storageState();
await seed.close();
for (const r of ["/settings/previews","/settings/tokens"]) {
  for (let i = 1; i <= 2; i++) {
    const p = await b.newPage({ storageState: state });
    const errs: string[] = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 80)));
    const res = await p.goto(BASE + r, { waitUntil: "networkidle", timeout: 45000 });
    const h1 = await p.locator("h1").first().textContent().catch(() => "");
    console.log(`try${i} ${String(res?.status()).padEnd(4)} ${r.padEnd(20)} h1=${JSON.stringify((h1||"").trim())} ${errs.length?"ERR "+errs[0]:"clean"}`);
    await p.close();
  }
}
await b.close();
