/* End-to-end check of drag-and-drop moves in the library and datarooms.
   Seeds its own fixtures (team "dnd-team", user dnd@example.com), drives a
   real Chromium via Playwright, and asserts against the database.

   Needs the dev stack running with server output captured to a file:
     docker compose -f docker-compose.dev.yml up -d
     bun dev > /tmp/foyer-dev.log 2>&1 &
     bun run scripts/dnd-e2e.ts /tmp/foyer-dev.log
*/
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const DEV_LOG = process.argv[2];
if (!DEV_LOG) {
  console.error("usage: bun run scripts/dnd-e2e.ts <dev-server-log-file>");
  process.exit(1);
}
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const db = new PrismaClient();
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${label}: ${ok ? "PASS" : `FAIL ${detail}`}`);
}

async function magicLink(after: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const matches = [
      ...readFileSync(DEV_LOG, "utf8").matchAll(/\[email:dev\] link: (\S+)/g),
    ];
    if (matches.length > after) return matches[matches.length - 1][1];
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no magic link in dev log - is RESEND_API_KEY unset?");
}

async function seed() {
  const user = await db.user.upsert({
    where: { email: "dnd@example.com" },
    update: {},
    create: { email: "dnd@example.com", name: "DnD Test" },
  });
  const team = await db.team.upsert({
    where: { slug: "dnd-team" },
    update: {},
    create: { name: "DnD Team", slug: "dnd-team" },
  });
  await db.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
    update: {},
    create: { teamId: team.id, userId: user.id, role: "OWNER" },
  });

  // fresh fixtures every run
  await db.dataroom.deleteMany({ where: { teamId: team.id, name: "DnD Room" } });
  await db.folder.deleteMany({ where: { teamId: team.id } });
  await db.document.deleteMany({ where: { teamId: team.id } });

  const room = await db.dataroom.create({
    data: { teamId: team.id, name: "DnD Room" },
  });
  const drA = await db.dataroomFolder.create({
    data: { dataroomId: room.id, name: "Folder A", orderIndex: 0 },
  });
  const drB = await db.dataroomFolder.create({
    data: { dataroomId: room.id, name: "Folder B", orderIndex: 1 },
  });
  const mkDrDoc = async (name: string, folderId: string | null, order: number) => {
    const doc = await db.document.create({
      data: { teamId: team.id, name, type: "TEXT" },
    });
    return db.dataroomDocument.create({
      data: { dataroomId: room.id, documentId: doc.id, folderId, orderIndex: order },
    });
  };
  const drDocInA = await mkDrDoc("Doc In A", drA.id, 0);
  const drRootDoc = await mkDrDoc("Root Doc", null, 1);

  const libA = await db.folder.create({ data: { teamId: team.id, name: "Lib A" } });
  const libB = await db.folder.create({ data: { teamId: team.id, name: "Lib B" } });
  const looseDoc = await db.document.create({
    data: { teamId: team.id, name: "Loose Doc", type: "TEXT" },
  });
  const libDoc = await db.document.create({
    data: { teamId: team.id, name: "Lib Doc", type: "TEXT", folderId: libA.id },
  });

  return { team, room, drA, drB, drDocInA, drRootDoc, libA, libB, looseDoc, libDoc };
}

async function login(page: Page) {
  const before = [
    ...readFileSync(DEV_LOG, "utf8").matchAll(/\[email:dev\] link: /g),
  ].length;
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "dnd@example.com");
  await page.click('button[type="submit"]');
  await page.goto(await magicLink(before));
  await page.waitForLoadState("networkidle");
}

async function main() {
  const fx = await seed();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await login(page);

  const row = (text: string) => page.locator("tr", { hasText: text }).first();
  const roomUrl = `${BASE}/datarooms/${fx.room.id}`;
  const settle = () => page.waitForTimeout(1200);

  // ---- dataroom ----
  await page.goto(roomUrl);
  await page.waitForSelector("text=Root Doc");
  await row("Root Doc").dragTo(row("Folder B"));
  await settle();
  check(
    "dr doc -> folder row",
    (await db.dataroomDocument.findUnique({ where: { id: fx.drRootDoc.id } }))
      ?.folderId === fx.drB.id
  );

  await page.goto(`${roomUrl}?folder=${fx.drA.id}`);
  await page.waitForSelector("text=Doc In A");
  await row("Doc In A").dragTo(
    page
      .locator('nav[aria-label="Data room explorer"] div', {
        hasText: /^Folder B$/,
      })
      .last()
  );
  await settle();
  check(
    "dr doc -> explorer tree",
    (await db.dataroomDocument.findUnique({ where: { id: fx.drDocInA.id } }))
      ?.folderId === fx.drB.id
  );

  await page.goto(roomUrl);
  await page.waitForSelector("text=Folder A");
  await row("Folder B").dragTo(row("Folder A"), {
    targetPosition: { x: 200, y: 3 },
  });
  await settle();
  {
    const [a, b] = await Promise.all([
      db.dataroomFolder.findUnique({ where: { id: fx.drA.id } }),
      db.dataroomFolder.findUnique({ where: { id: fx.drB.id } }),
    ]);
    check(
      "dr folder edge -> reorder",
      b!.orderIndex < a!.orderIndex && b!.parentId === null,
      `(A=${a!.orderIndex} B=${b!.orderIndex} parentB=${b!.parentId})`
    );
  }

  await page.goto(roomUrl);
  await page.waitForSelector("text=Folder A");
  await row("Folder A").dragTo(row("Folder B"));
  await settle();
  check(
    "dr folder center -> nest",
    (await db.dataroomFolder.findUnique({ where: { id: fx.drA.id } }))
      ?.parentId === fx.drB.id
  );

  // ---- library ----
  await page.goto(`${BASE}/documents`);
  await page.waitForSelector("text=Loose Doc");
  await row("Loose Doc").dragTo(row("Lib B"));
  await settle();
  check(
    "lib doc -> folder row",
    (await db.document.findUnique({ where: { id: fx.looseDoc.id } }))
      ?.folderId === fx.libB.id
  );

  await page.goto(`${BASE}/documents?folder=${fx.libA.id}`);
  await page.waitForSelector("text=Lib Doc");
  await row("Lib Doc").dragTo(page.locator('a:has-text("All documents")').first());
  await settle();
  check(
    "lib doc -> root crumb",
    (await db.document.findUnique({ where: { id: fx.libDoc.id } }))
      ?.folderId === null
  );

  await page.goto(`${BASE}/documents`);
  await page.waitForSelector("text=Lib A");
  await row("Lib A").dragTo(row("Lib B"));
  await settle();
  check(
    "lib folder -> folder",
    (await db.folder.findUnique({ where: { id: fx.libA.id } }))?.parentId ===
      fx.libB.id
  );

  if (errors.length) console.log("page errors:", errors.slice(0, 5));
  await browser.close();
  process.exit(failures ? 1 : 0);
}

main()
  .catch((e) => {
    console.error("E2E error:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
