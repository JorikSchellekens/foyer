import { chromium } from "playwright";
const BASE = "https://foyer-review.mempoolsurfer.com";
const b = await chromium.launch();
const seed = await b.newPage();
await seed.goto(`${BASE}/api/demo-login`, { waitUntil: "networkidle" });
const state = await seed.context().storageState();
const cookies = (await seed.context().cookies()).map(c => `${c.name}=${c.value}`).join("; ");
await seed.close();

// server HTML
const res = await fetch(`${BASE}/links`, { headers: { cookie: cookies } });
const html = await res.text();

// hydrated DOM
const p = await b.newPage({ storageState: state });
await p.goto(`${BASE}/links`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const clientHtml = await p.content();
await b.close();

const strip = (s: string) => s
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<style[\s\S]*?<\/style>/g, "");
const texts = (s: string) => (strip(s).match(/>([^<>]{2,80})</g) || [])
  .map(t => t.slice(1, -1).trim()).filter(Boolean);
const a = texts(html), c = texts(clientHtml);
const inA = new Set(a), inC = new Set(c);
console.log("only in SERVER html:", a.filter(t => !inC.has(t)).slice(0, 15));
console.log("only in CLIENT dom :", c.filter(t => !inA.has(t)).slice(0, 15));
// aria-labels / titles differ?
const attrs = (s: string, re: RegExp) => (s.match(re) || []).map(m => m);
console.log("server aria-labels w/ Expire:", attrs(html, /aria-label="[^"]*Expir[^"]*"/g).slice(0,8));
console.log("client aria-labels w/ Expire:", attrs(clientHtml, /aria-label="[^"]*Expir[^"]*"/g).slice(0,8));
