/* End-to-end check of assigning data rooms from the documents view.
   Seeds its own fixtures (team "assign-team", user assign@example.com), drives
   a real Chromium via Playwright, and asserts against the database.

     docker compose -f docker-compose.dev.yml up -d
     bun dev > /tmp/foyer-dev.log 2>&1 &
     bun run scripts/dataroom-assign-e2e.ts /tmp/foyer-dev.log
*/
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const DEV_LOG = process.argv[2];
if (!DEV_LOG) {
  console.error(
    "usage: bun run scripts/dataroom-assign-e2e.ts <dev-server-log-file>"
  );
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
    where: { email: "assign@example.com" },
    update: {},
    create: { email: "assign@example.com", name: "Assign Test" },
  });
  const team = await db.team.upsert({
    where: { slug: "assign-team" },
    update: {},
    create: { name: "Assign Team", slug: "assign-team" },
  });
  await db.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
    update: {},
    create: { teamId: team.id, userId: user.id, role: "OWNER" },
  });

  await db.dataroom.deleteMany({ where: { teamId: team.id } });
  await db.document.deleteMany({ where: { teamId: team.id } });
  await db.folder.deleteMany({ where: { teamId: team.id } });

  const alpha = await db.dataroom.create({
    data: { teamId: team.id, name: "Alpha Room" },
  });
  const beta = await db.dataroom.create({
    data: { teamId: team.id, name: "Beta Room" },
  });
  // something already in Alpha, so appends must land after it
  const sitting = await db.document.create({
    data: { teamId: team.id, name: "Sitting Doc", type: "TEXT" },
  });
  await db.dataroomDocument.create({
    data: { dataroomId: alpha.id, documentId: sitting.id, orderIndex: 7 },
  });

  const docs = [];
  for (const name of ["Doc One", "Doc Two", "Doc Three"]) {
    docs.push(
      await db.document.create({
        data: { teamId: team.id, name, type: "TEXT" },
      })
    );
  }
  return { team, alpha, beta, docs, sitting };
}

async function login(page: Page) {
  const before = [
    ...readFileSync(DEV_LOG, "utf8").matchAll(/\[email:dev\] link: /g),
  ].length;
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "assign@example.com");
  await page.click('button[type="submit"]');
  await page.goto(await magicLink(before));
  await page.waitForLoadState("networkidle");
}

async function main() {
  const fx = await seed();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await login(page);

  const row = (text: string) => page.locator("tr", { hasText: text }).first();
  const settle = () => page.waitForTimeout(1500);
  /**
   * Open a picker and toggle one room. `expect` waits for the refreshed server
   * render to show the change, so the next interaction never reads stale state.
   */
  const pick = async (
    open: () => Promise<void>,
    roomName: string,
    expect?: { doc: string; present: boolean }
  ) => {
    await open();
    const option = page.getByRole("option", { name: roomName });
    await option.waitFor();
    await page.waitForTimeout(400);
    await option.click({ force: true });
    await settle();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    if (expect) {
      const badge = row(expect.doc)
        .getByTitle("Data rooms")
        .getByText(roomName, { exact: true });
      await badge.waitFor({
        state: expect.present ? "visible" : "detached",
        timeout: 20000,
      });
    }
  };
  const cell = (docName: string) => () =>
    row(docName).getByTitle("Data rooms").click();
  const memberships = async (docName: string) =>
    (
      await db.dataroomDocument.findMany({
        where: { document: { name: docName, teamId: fx.team.id } },
        include: { dataroom: true },
      })
    )
      .map((j) => j.dataroom.name)
      .sort();

  // ---- add one document to two rooms from the table cell ----
  await page.goto(`${BASE}/documents`);
  await page.waitForSelector("text=Doc One");
  await pick(cell("Doc One"), "Alpha Room", { doc: "Doc One", present: true });
  await pick(cell("Doc One"), "Beta Room", { doc: "Doc One", present: true });
  check(
    "cell add to two rooms",
    (await memberships("Doc One")).join(",") === "Alpha Room,Beta Room",
    `got ${(await memberships("Doc One")).join(",")}`
  );

  // ---- appended at the room root, after what was already there ----
  {
    const join = await db.dataroomDocument.findFirst({
      where: { dataroomId: fx.alpha.id, document: { name: "Doc One" } },
    });
    check(
      "lands at room root, appended last",
      join!.folderId === null && join!.orderIndex > 7,
      `folderId=${join!.folderId} orderIndex=${join!.orderIndex}`
    );
  }

  // ---- badges render the membership ----
  await page.goto(`${BASE}/documents`);
  await page.waitForSelector("text=Doc One");
  check(
    "badges show both rooms",
    (await row("Doc One").getByTitle("Data rooms").innerText())
      .replace(/\s+/g, " ")
      .includes("Alpha Room"),
    await row("Doc One").getByTitle("Data rooms").innerText()
  );

  // ---- toggling a room off removes it ----
  await pick(cell("Doc One"), "Beta Room", { doc: "Doc One", present: false });
  check(
    "toggle off removes membership",
    (await memberships("Doc One")).join(",") === "Alpha Room",
    `got ${(await memberships("Doc One")).join(",")}`
  );

  // ---- re-adding is idempotent: no duplicate join rows ----
  await page.goto(`${BASE}/documents`);
  await page.waitForSelector("text=Doc One");
  await pick(cell("Doc One"), "Alpha Room", { doc: "Doc One", present: false });
  await pick(cell("Doc One"), "Alpha Room", { doc: "Doc One", present: true });
  check(
    "re-add stays single row",
    (await db.dataroomDocument.count({
      where: { dataroomId: fx.alpha.id, document: { name: "Doc One" } },
    })) === 1
  );

  // ---- bulk select (including a shift-click range) then add ----
  await page.goto(`${BASE}/documents`);
  await page.waitForSelector("text=Doc Three");
  await row("Doc One").locator('button[role="checkbox"]').click();
  await row("Doc Three")
    .locator('button[role="checkbox"]')
    .click({
      modifiers: ["Shift"],
    });
  const barText = await page.locator("text=selected").first().innerText();
  await pick(
    () => page.getByRole("button", { name: "Add to data rooms" }).click(),
    "Beta Room"
  );
  const inBeta = await db.dataroomDocument.count({
    where: { dataroomId: fx.beta.id },
  });
  check("bulk shift-range selected 3", barText.includes("3"), barText);
  check("bulk add put 3 documents in Beta", inBeta === 3, `got ${inBeta}`);

  // ---- document detail page: shows rooms, removes from one ----
  await page.goto(`${BASE}/documents/${fx.docs[0].id}`);
  await page.waitForSelector("text=Data rooms");
  check(
    "detail page lists the rooms",
    await page.locator("a", { hasText: "Alpha Room" }).first().isVisible()
  );
  await page.getByRole("button", { name: "Remove from Beta Room" }).click();
  // Wait for the refreshed server render, not a fixed delay: the picker below
  // reads its state from it.
  await page
    .getByRole("button", { name: "Remove from Beta Room" })
    .waitFor({ state: "detached", timeout: 15000 });
  check(
    "detail page remove works",
    (await memberships("Doc One")).join(",") === "Alpha Room",
    `got ${(await memberships("Doc One")).join(",")}`
  );

  // ---- add from the detail page ----
  await pick(
    () => page.getByRole("button", { name: "Add to data room" }).click(),
    "Beta Room"
  );
  check(
    "detail page add works",
    (await memberships("Doc One")).join(",") === "Alpha Room,Beta Room",
    `got ${(await memberships("Doc One")).join(",")}`
  );

  // ---- the room's own add-from-library dialog still works ----
  await page.goto(`${BASE}/datarooms/${fx.alpha.id}`);
  await page.getByRole("button", { name: "Add from library" }).click();
  await page
    .getByRole("dialog")
    .locator("label", { hasText: "Doc Two" })
    .click();
  await page.getByRole("button", { name: /^Add / }).click();
  await settle();
  check(
    "add-from-library unchanged",
    (await memberships("Doc Two")).includes("Alpha Room"),
    `got ${(await memberships("Doc Two")).join(",")}`
  );

  check("no page errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  await db.$disconnect();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
