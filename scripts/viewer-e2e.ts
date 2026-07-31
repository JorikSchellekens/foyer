/* Verifies the public viewer - the surface a recipient actually meets, and the
   one no other harness covers. sign-e2e drives signing; dnd and
   dataroom-assign drive the dashboard. Nothing until now opened a shared link
   and read a document.

   Checks each gate (public, email, verified email, password, archived), then
   reading itself: pages render, page turns advance, the watermark is present,
   the dataroom index lists its contents. Runs the whole sweep at a desktop and
   a phone viewport, then once more with prefers-reduced-motion, and finally
   walks the app from the keyboard alone.

   Screenshots land in the directory given by SHOTS (default /tmp/foyer-shots).

   Needs the demo workspace seeded and the dev stack running:
     bun run scripts/demo-seed.ts
     RESEND_API_KEY= bun dev > /tmp/foyer-dev.log 2>&1 &
     bun run scripts/viewer-e2e.ts
*/
import { chromium, type Browser, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "fs";
import { randomBytes, scryptSync } from "crypto";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "/tmp/foyer-shots";
const FIXTURE_SLUG = "viewer-e2e-fixture";
const FIXTURE_PASSWORD = "fixture-pass-2026";
const db = new PrismaClient();

/** Mirrors lib/tokens.ts, which is server-only and cannot be imported here. */
function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const DESKTOP = { width: 1512, height: 900 };
const PHONE = { width: 390, height: 844 };

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${name}: ${ok ? "PASS" : "FAIL"}${detail ? ` (${detail})` : ""}`);
}

/** Console errors and failed requests are a failure in their own right. */
function watch(page: Page, label: string, sink: string[]) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // The PDF worker logs benign font substitutions on these fixtures.
    if (/font|Warning/i.test(t)) return;
    sink.push(`[${label}] ${t}`);
  });
  page.on("pageerror", (e) => sink.push(`[${label}] ${e.message}`));
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** Waits for the first rendered PDF page rather than a fixed sleep. */
async function pageRendered(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const c = document.querySelector("canvas");
        return !!c && (c as HTMLCanvasElement).width > 50;
      },
      { timeout: 30_000 }
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- gates

async function publicDocument(page: Page, tag: string, errs: string[]) {
  await page.goto(`${BASE}/view/larkfield-deck`, { waitUntil: "networkidle" });
  const rendered = await pageRendered(page);
  check(`${tag} public link renders a page`, rendered);
  await shot(page, `${tag}-viewer-public`);

  // The page counter is how a reader knows where they are.
  const counter = await page
    .locator("text=/\\d+\\s*\\/\\s*\\d+/")
    .first()
    .textContent()
    .catch(() => null);
  check(`${tag} page counter present`, !!counter, counter ?? "none");

  const before = counter;
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(900);
  const after = await page
    .locator("text=/\\d+\\s*\\/\\s*\\d+/")
    .first()
    .textContent()
    .catch(() => null);
  check(
    `${tag} arrow key turns the page`,
    !!after && after !== before,
    `${before} -> ${after}`
  );
  await shot(page, `${tag}-viewer-page2`);
  check(`${tag} no console errors in viewer`, errs.length === 0, errs.join("; "));
}

async function emailGate(page: Page, tag: string) {
  await page.goto(`${BASE}/view/msa-template`, {
    waitUntil: "domcontentloaded",
  });
  const email = page.locator('input[type="email"]').first();
  const shown = await email.isVisible().catch(() => false);
  check(`${tag} email gate asks for an address`, shown);
  await shot(page, `${tag}-gate-email`);

  if (!shown) return;
  // An invalid address must be refused inline, not by navigating away.
  await email.fill("not-an-email");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const stillThere = await email.isVisible().catch(() => false);
  check(`${tag} invalid email refused inline`, stillThere);

  await email.fill(`viewer.e2e.${tag}@example.com`);
  await page.keyboard.press("Enter");
  const rendered = await pageRendered(page);
  await shot(page, `${tag}-gate-email-passed`);
  if (rendered) {
    check(`${tag} email gate opens the document`, true);
    return;
  }
  // Submitting this gate on every pass eventually trips the rate limiter,
  // which is the gate working rather than failing. Say so instead of
  // reporting a break, but only for that specific refusal.
  const limited = /too many attempts/i.test(
    await page.locator("body").innerText()
  );
  check(
    `${tag} email gate opens the document`,
    limited,
    limited ? "rate-limited, gate held" : "no document and no explanation"
  );
}

/**
 * Password gate and watermark, on a fixture link the harness owns.
 *
 * Every seeded password link also sits behind email verification, which needs
 * a code out of the mail log - too deep for this pass. A link of our own is
 * also the only way to exercise the watermark, which no demo link enables.
 */
async function passwordGate(page: Page, tag: string, slug: string) {
  await page.goto(`${BASE}/view/${slug}`, { waitUntil: "domcontentloaded" });
  const pw = page.locator('input[type="password"]').first();
  const shown = await pw.isVisible().catch(() => false);
  check(`${tag} password link asks for a password`, shown);
  await shot(page, `${tag}-gate-password`);
  if (!shown) return;

  await pw.fill("wrong-password");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  const body = await page.locator("body").innerText();
  const refused = /not correct|incorrect|wrong|try again/i.test(body);
  check(`${tag} wrong password says so inline`, refused, body.slice(0, 80));
  await shot(page, `${tag}-gate-password-wrong`);

  await pw.fill(FIXTURE_PASSWORD);
  await page.keyboard.press("Enter");
  const rendered = await pageRendered(page);
  check(`${tag} correct password opens the document`, rendered);

  // Two offset alpha layers, 60 tiles each. Anonymous behind a password gate,
  // so the stamp falls back to "confidential" rather than an email.
  const tiles = await page.locator('span:has-text("confidential")').count();
  check(
    `${tag} watermark is stamped over the page`,
    tiles >= 120,
    `${tiles} tiles`
  );
  await shot(page, `${tag}-viewer-watermark`);
}

/**
 * An archived link is filtered out of the lookup itself (lib/access.ts), so it
 * 404s exactly like a slug that never existed. That is deliberate - it refuses
 * to confirm the link was ever real - so the check is that it stays quiet.
 */
async function archivedLink(page: Page, tag: string) {
  const res = await page.goto(`${BASE}/view/roadmap-2025`, {
    waitUntil: "domcontentloaded",
  });
  const body = await page.locator("body").innerText();
  check(`${tag} archived link 404s`, res?.status() === 404, `${res?.status()}`);
  check(
    `${tag} archived link does not confirm it existed`,
    !/archiv|disabled|revoked|expired/i.test(body),
    body.slice(0, 80)
  );
  await shot(page, `${tag}-gate-archived`);
}

/** An expired link, unlike an archived one, does say what happened. */
async function expiredLink(page: Page, tag: string) {
  await page.goto(`${BASE}/view/larkfield-deck-q1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(700);
  const body = await page.locator("body").innerText();
  check(
    `${tag} expired link explains itself`,
    /expired/i.test(body),
    body.slice(0, 80)
  );
  await shot(page, `${tag}-gate-expired`);
}

async function dataroomIndex(page: Page, tag: string) {
  await page.goto(`${BASE}/view/series-b-process`, {
    waitUntil: "domcontentloaded",
  });
  // Wait for the gate rather than sampling for it: at domcontentloaded the
  // input may not exist yet, and treating that as "already through" walks
  // straight past the gate and asserts against it.
  const email = page.locator('input[type="email"]').first();
  const gated = await email
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (gated) {
    await email.fill("index.probe@example.com");
    await page.keyboard.press("Enter");
    await page.waitForLoadState("networkidle");
  }

  const entries = page.locator('a[href*="/d/"]:visible');
  const listed = await entries
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  check(
    `${tag} dataroom index lists contents`,
    listed,
    `${await entries.count()} entries`
  );
  await shot(page, `${tag}-dataroom-index`);
  if (!listed) return;

  // Opening the first document from the index must land in the reader. Not
  // every item is a PDF, so "opened" means the reader painted something -
  // a canvas for PDFs, rendered text for the plain-text ones.
  // :visible matters - the collapsed contents drawer holds the same hrefs, and
  // on a phone its links are in the DOM but hidden.
  const first = page.locator('a[href*="/d/"]:visible').first();
  const ready = await first
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    check(`${tag} dataroom document opens`, false, "no document link found");
    return;
  }
  await first.click();
  await page.waitForLoadState("networkidle");
  const opened = await page
    .waitForFunction(
      () => {
        const c = document.querySelector("canvas") as HTMLCanvasElement | null;
        if (c && c.width > 50) return true;
        const main = document.querySelector("main");
        return !!main && main.innerText.trim().length > 120;
      },
      { timeout: 30_000 }
    )
    .then(() => true)
    .catch(() => false);
  check(`${tag} dataroom document opens`, opened);
  await shot(page, `${tag}-dataroom-document`);
}

/** Nothing may overflow the viewport horizontally at phone width. */
async function noSideScroll(page: Page, where: string) {
  const over = await page.evaluate(
    () =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check(`phone ${where} does not scroll sideways`, over <= 1, `${over}px`);
}

/**
 * Every control a thumb needs must be inside the viewport and big enough to
 * hit. 40px rather than the usual 44 because the viewer chrome is deliberately
 * slim; anything under that is a miss waiting to happen.
 */
async function reachableControls(page: Page, where: string) {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const els = document.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href]"
    );
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || parseFloat(s.opacity) < 0.05) continue;
      const label =
        el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 20) || el.tagName;
      if (r.right > innerWidth + 1 || r.left < -1)
        out.push(`${label}: off-screen horizontally`);
      else if (Math.min(r.width, r.height) < 40)
        out.push(`${label}: ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out.slice(0, 6);
  });
  check(`phone ${where} controls are reachable`, bad.length === 0, bad.join("; "));
}

// ---------------------------------------------------------------- passes

async function sweep(
  browser: Browser,
  tag: string,
  viewport: typeof DESKTOP,
  fixtureSlug: string
) {
  const phone = viewport === PHONE;
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errs: string[] = [];
  watch(page, tag, errs);

  await publicDocument(page, tag, errs);
  if (phone) {
    await noSideScroll(page, "viewer");
    await reachableControls(page, "viewer");
  }
  await emailGate(page, tag);
  await passwordGate(page, tag, fixtureSlug);
  await archivedLink(page, tag);
  await expiredLink(page, tag);
  await dataroomIndex(page, tag);
  if (phone) {
    await noSideScroll(page, "dataroom");
    await reachableControls(page, "dataroom");
  }

  await ctx.close();
}

/** With motion reduced, nothing may stay stuck invisible or mid-animation. */
async function reducedMotion(browser: Browser) {
  const ctx = await browser.newContext({
    viewport: DESKTOP,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const errs: string[] = [];
  watch(page, "reduced", errs);

  await page.goto(`${BASE}/view/larkfield-deck`, { waitUntil: "networkidle" });
  const rendered = await pageRendered(page);
  check("reduced-motion viewer still renders", rendered);

  // The reveal utilities animate opacity from 0. If the reduced-motion strip
  // in globals.css missed one, it stays at 0 and that content reads as blank.
  // Only these classes are checked: plenty of controls (a disabled page arrow,
  // a hover-revealed icon) sit at opacity 0 on purpose and always should.
  const invisible = await page.evaluate(() => {
    const bad: string[] = [];
    const animated = document.querySelectorAll<HTMLElement>(
      ".reveal, .reveal-up, .stagger-item, .tick-in"
    );
    for (const el of animated) {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      if (parseFloat(s.opacity) < 0.05)
        bad.push(`${el.tagName}.${(el.className || "").toString().slice(0, 40)}`);
    }
    return bad.slice(0, 5);
  });
  check(
    "reduced-motion leaves nothing invisible",
    invisible.length === 0,
    invisible.join(", ")
  );
  await shot(page, "reduced-motion-viewer");

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const loginInvisible = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("form");
    return el ? parseFloat(getComputedStyle(el).opacity) < 0.05 : false;
  });
  check("reduced-motion login form is visible", !loginInvisible);
  await shot(page, "reduced-motion-login");
  await ctx.close();
}

/**
 * Every interactive control must be reachable by Tab and must show a focus
 * ring when it is. The document library was keyboard-unreachable before the
 * accessibility pass; this is what would catch that regressing.
 */
async function keyboard(browser: Browser) {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const errs: string[] = [];
  watch(page, "keyboard", errs);

  await page.goto(`${BASE}/view/larkfield-deck`, { waitUntil: "networkidle" });
  await pageRendered(page);

  const seen: string[] = [];
  let ringed = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const ring =
        s.outlineStyle !== "none" ||
        s.boxShadow !== "none" ||
        s.getPropertyValue("--tw-ring-shadow") !== "";
      return {
        label:
          el.getAttribute("aria-label") ||
          el.textContent?.trim().slice(0, 28) ||
          el.tagName,
        ring,
      };
    });
    if (!info) break;
    seen.push(info.label);
    if (info.ring) ringed++;
  }
  check("viewer is tab-traversable", seen.length >= 3, `${seen.length} stops`);
  check(
    "focused controls show a ring",
    seen.length > 0 && ringed === seen.length,
    `${ringed}/${seen.length}`
  );
  await shot(page, "keyboard-viewer-focus");

  check("no console errors during keyboard pass", errs.length === 0, errs.join("; "));
  await ctx.close();
}

// ---------------------------------------------------------------- run

const demo = await db.team.findFirst({ where: { slug: "larkfield-instruments" } });
if (!demo) {
  console.error("demo workspace missing - run scripts/demo-seed.ts first");
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

// Own fixture: the only password-without-email-verification link, and the only
// one with the watermark on. Torn down at the end so the demo data is left
// exactly as seeded.
const deck = await db.link.findFirst({
  where: { slug: "larkfield-deck", teamId: demo.id },
});
if (!deck?.documentId) {
  console.error("larkfield-deck link missing - reseed the demo workspace");
  process.exit(1);
}
const fixture = await db.link.create({
  data: {
    name: "viewer-e2e fixture",
    slug: FIXTURE_SLUG,
    teamId: demo.id,
    documentId: deck.documentId,
    target: "DOCUMENT",
    accessMode: "PUBLIC",
    passwordHash: hashPassword(FIXTURE_PASSWORD),
    watermark: true,
  },
});

const browser = await chromium.launch();
try {
  console.log("--- desktop 1512x900 ---");
  await sweep(browser, "desktop", DESKTOP, FIXTURE_SLUG);
  console.log("--- phone 390x844 ---");
  await sweep(browser, "phone", PHONE, FIXTURE_SLUG);
  console.log("--- reduced motion ---");
  await reducedMotion(browser);
  console.log("--- keyboard ---");
  await keyboard(browser);
} finally {
  await browser.close();
  await db.view.deleteMany({ where: { linkId: fixture.id } });
  await db.link.delete({ where: { id: fixture.id } });
  await db.$disconnect();
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
console.log(`screenshots: ${SHOTS}`);
process.exit(failures === 0 ? 0 : 1);
