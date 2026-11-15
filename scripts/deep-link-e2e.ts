/* Verifies direct links to one document of a data room:
     <link url>/d/<data room document id>

   The address has to work as something you send to a person who has never
   opened the room. So each case starts with no cookies, opens the document
   address, passes the link's gate right there, and must end on that document
   rather than on the room's index.

   Cases: public link, password, email, verified email (through the emailed
   link), a personal invite link with ?d=, and an address whose document is
   not in the room (falls back to the index).

   Builds its own links on the demo data room and removes them at the end.

   Needs the demo workspace seeded and the dev stack running:
     bun run scripts/demo-seed.ts
     RESEND_API_KEY= bun dev > /tmp/foyer-dev.log 2>&1 &
     bun run scripts/deep-link-e2e.ts
*/
import { chromium, type Browser, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "fs";
import { randomBytes, scryptSync } from "crypto";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "/tmp/foyer-shots";
const PASSWORD = "deep-link-pass-2026";
const PREFIX = "deep-link-e2e";
const db = new PrismaClient();

/** Mirrors lib/tokens.ts, which is server-only and cannot be imported here. */
function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${name}: ${ok ? "PASS" : "FAIL"}${detail ? ` (${detail})` : ""}`);
}

const pathOf = (page: Page) => new URL(page.url()).pathname;

/** The reader for this document is on screen, at this document's address. */
async function onDocument(page: Page, slug: string, itemId: string, name: string) {
  const reached = await page
    .waitForFunction(
      ([path, title]) =>
        location.pathname === path &&
        !document.querySelector('input[type="email"], input[type="password"]') &&
        document.body.innerText.includes(title),
      [`/view/${slug}/d/${itemId}`, name] as const,
      { timeout: 30_000 }
    )
    .then(() => true)
    .catch(() => false);
  return reached;
}

async function fresh(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 900 },
  });
  return { context, page: await context.newPage() };
}

// ---------------------------------------------------------------- fixtures

const demo = await db.team.findFirst({ where: { slug: "larkfield-instruments" } });
if (!demo) {
  console.error("demo workspace missing - run scripts/demo-seed.ts first");
  process.exit(1);
}
const room = await db.link.findFirst({
  where: { slug: "series-b-process", teamId: demo.id },
  include: {
    dataroom: {
      include: {
        documents: {
          include: { document: true },
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        },
      },
    },
  },
});
const docs = (room?.dataroom?.documents ?? []).filter(
  (d) => d.document.type === "PDF"
);
if (!room?.dataroomId || docs.length < 2) {
  console.error("series-b-process data room missing - reseed the demo workspace");
  process.exit(1);
}
// Not the first document: landing on the first one could be mistaken for
// "opened the room and clicked the top entry".
const target = docs[docs.length - 1];
const other = docs[0];
const itemId = target.id;
const docName = target.document.name;
mkdirSync(SHOTS, { recursive: true });

// Leftovers from an interrupted run would collide on the slug.
await db.link.deleteMany({ where: { slug: { startsWith: PREFIX } } });

const base = {
  teamId: demo.id,
  dataroomId: room.dataroomId,
  target: "DATAROOM" as const,
  notifyOnAccess: false,
};
const links = {
  public: await db.link.create({
    data: { ...base, name: `${PREFIX} public`, slug: `${PREFIX}-public` },
  }),
  password: await db.link.create({
    data: {
      ...base,
      name: `${PREFIX} password`,
      slug: `${PREFIX}-password`,
      passwordHash: hashPassword(PASSWORD),
    },
  }),
  email: await db.link.create({
    data: {
      ...base,
      name: `${PREFIX} email`,
      slug: `${PREFIX}-email`,
      accessMode: "EMAIL",
    },
  }),
  verified: await db.link.create({
    data: {
      ...base,
      name: `${PREFIX} verified`,
      slug: `${PREFIX}-verified`,
      accessMode: "EMAIL_VERIFIED",
    },
  }),
  // shares one document only: the other one must not open through it
  scoped: await db.link.create({
    data: {
      ...base,
      name: `${PREFIX} scoped`,
      slug: `${PREFIX}-scoped`,
      fullAccess: false,
      permissions: {
        create: { itemType: "DATAROOM_DOCUMENT", itemId, canView: true },
      },
    },
  }),
};
const inviteToken = randomBytes(24).toString("base64url");
await db.linkRecipient.create({
  data: {
    linkId: links.verified.id,
    email: "deep.link.invite@example.com",
    token: inviteToken,
  },
});

// ---------------------------------------------------------------- cases

async function publicLink(browser: Browser) {
  const { context, page } = await fresh(browser);
  const slug = links.public.slug;
  await page.goto(`${BASE}/view/${slug}/d/${itemId}`);
  check(
    "public link: document address opens the document",
    await onDocument(page, slug, itemId, docName),
    pathOf(page)
  );
  await page.screenshot({ path: `${SHOTS}/deep-link-public.png` });
  await context.close();
}

async function passwordLink(browser: Browser) {
  const { context, page } = await fresh(browser);
  const slug = links.password.slug;
  await page.goto(`${BASE}/view/${slug}/d/${itemId}`);
  const field = page.locator('input[type="password"]').first();
  const gated = await field
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check(
    "password link: gate is shown at the document address",
    gated && pathOf(page) === `/view/${slug}/d/${itemId}`,
    pathOf(page)
  );
  const body = await page.locator("body").innerText();
  check(
    "password link: gate does not name the document",
    !body.includes(docName)
  );
  await page.screenshot({ path: `${SHOTS}/deep-link-password-gate.png` });
  if (!gated) return context.close();
  await field.fill(PASSWORD);
  await page.keyboard.press("Enter");
  check(
    "password link: passing the gate opens the document",
    await onDocument(page, slug, itemId, docName),
    pathOf(page)
  );
  await page.screenshot({ path: `${SHOTS}/deep-link-password-open.png` });
  await context.close();
}

async function emailLink(browser: Browser) {
  const { context, page } = await fresh(browser);
  const slug = links.email.slug;
  await page.goto(`${BASE}/view/${slug}/d/${itemId}`);
  const field = page.locator('input[type="email"]').first();
  const gated = await field
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check(
    "email link: gate is shown at the document address",
    gated && pathOf(page) === `/view/${slug}/d/${itemId}`,
    pathOf(page)
  );
  if (!gated) return context.close();
  await field.fill("deep.link.email@example.com");
  await page.keyboard.press("Enter");
  check(
    "email link: passing the gate opens the document",
    await onDocument(page, slug, itemId, docName),
    pathOf(page)
  );
  await context.close();
}

async function verifiedLink(browser: Browser) {
  const { context, page } = await fresh(browser);
  const slug = links.verified.slug;
  const email = `deep.link.verified.${Date.now()}@example.com`;
  await page.goto(`${BASE}/view/${slug}/d/${itemId}`);
  const field = page.locator('input[type="email"]').first();
  const gated = await field
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check("verified link: gate is shown at the document address", gated);
  if (!gated) return context.close();
  await field.fill(email);
  await page.keyboard.press("Enter");
  await page
    .getByText(/verification link/i)
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});

  // The email itself is not delivered in dev; its link is the stored token.
  let token: string | null = null;
  for (let i = 0; i < 20 && !token; i++) {
    const row = await db.verificationToken.findFirst({
      where: { email, purpose: "VIEWER_VERIFY" },
      orderBy: { expiresAt: "desc" },
    });
    token = row?.token ?? null;
    if (!token) await page.waitForTimeout(250);
  }
  check("verified link: a verification link was issued", !!token);
  if (!token) return context.close();
  await page.goto(`${BASE}/api/view/verify?token=${token}`);
  check(
    "verified link: the emailed link returns to the document",
    await onDocument(page, slug, itemId, docName),
    pathOf(page)
  );
  await db.verificationToken.deleteMany({ where: { email } });
  await context.close();
}

async function inviteLink(browser: Browser) {
  const { context, page } = await fresh(browser);
  const slug = links.verified.slug;
  await page.goto(`${BASE}/view/t/${inviteToken}?d=${itemId}`);
  check(
    "invite link: ?d= opens the document",
    await onDocument(page, slug, itemId, docName),
    pathOf(page)
  );
  await context.close();

  // without ?d= it still opens the room, as before
  const plain = await fresh(browser);
  await plain.page.goto(`${BASE}/view/t/${inviteToken}`);
  await plain.page.waitForLoadState("domcontentloaded");
  check(
    "invite link: without ?d= opens the room",
    pathOf(plain.page) === `/view/${slug}`,
    pathOf(plain.page)
  );
  await plain.context.close();
}

async function fallsBackToRoom(browser: Browser) {
  const { context, page } = await fresh(browser);
  await page.goto(`${BASE}/view/${links.public.slug}/d/no-such-document`);
  await page.waitForLoadState("domcontentloaded");
  check(
    "unknown document: falls back to the room",
    pathOf(page) === `/view/${links.public.slug}`,
    pathOf(page)
  );

  // a document the link does not share must not open through its address
  const slug = links.scoped.slug;
  await page.goto(`${BASE}/view/${slug}/d/${other.id}`);
  await page.waitForLoadState("domcontentloaded");
  check(
    "unshared document: falls back to the room",
    pathOf(page) === `/view/${slug}`,
    pathOf(page)
  );
  await page.goto(`${BASE}/view/${slug}/d/${itemId}`);
  check(
    "scoped link: the shared document opens",
    await onDocument(page, slug, itemId, docName),
    pathOf(page)
  );
  await context.close();
}

// ---------------------------------------------------------------- run

const browser = await chromium.launch();
try {
  await publicLink(browser);
  await passwordLink(browser);
  await emailLink(browser);
  await verifiedLink(browser);
  await inviteLink(browser);
  await fallsBackToRoom(browser);
} finally {
  await browser.close();
  const ids = Object.values(links).map((l) => l.id);
  await db.view.deleteMany({ where: { linkId: { in: ids } } });
  await db.link.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
console.log(`screenshots: ${SHOTS}`);
process.exit(failures === 0 ? 0 : 1);
