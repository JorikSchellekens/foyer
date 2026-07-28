/* End-to-end check of the Papermark import engine.
 *
 * Papermark is not called: a synthetic ImportPlan of exactly the shape
 * scanPapermark produces is fed straight into materializeItems + runStep, so
 * the parts that actually write to the database - ordering, the external->local
 * id map, nested folder rebuilds, dataroom placement, link slugs, permission
 * translation, resume and idempotency - all run for real against real tables.
 *
 * Needs the dev stack up (postgres + minio):
 *   docker compose -f docker-compose.dev.yml up -d
 *
 * The --conditions flag is required: these modules import "server-only",
 * whose default export throws outside a server bundle.
 *   bun run --conditions=react-server scripts/import-e2e.ts
 */
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { materializeItems, runStep, type ImportOptions } from "../src/lib/papermark/run";
import type { ImportPlan } from "../src/lib/papermark/scan";
import {
  mapAccessMode,
  mapGroupToAllowList,
  mapLinkSettings,
  planLinkUrl,
  fileNameFor,
  sanitizeSlug,
} from "../src/lib/papermark/mapping";
import { matchManualFiles, normalizeCookie } from "../src/lib/papermark/files";
import type { PmLink } from "../src/lib/papermark/client";

const db = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean | undefined, detail?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
  }
}

// --------------------------------------------------------------- pure mapping

function linkFixture(over: Partial<PmLink> = {}): PmLink {
  return {
    id: "lnk_1",
    object: "link",
    name: "Deck",
    target_type: "document",
    audience_type: "general",
    group_id: null,
    document_id: "doc_1",
    dataroom_id: null,
    url: "https://www.papermark.com/view/lnk_1",
    domain: null,
    slug: null,
    expires_at: null,
    is_password_protected: false,
    email_protected: false,
    email_authenticated: false,
    allow_download: true,
    allow_list: [],
    deny_list: [],
    enable_watermark: false,
    watermark_config: null,
    enable_feedback: false,
    enable_screenshot_protection: false,
    enable_confidential_view: false,
    enable_agreement: false,
    agreement_id: null,
    welcome_message: null,
    enable_notification: true,
    show_banner: false,
    custom_fields: [],
    created: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function testMapping() {
  console.log("\nmapping");

  check("public link -> PUBLIC", mapAccessMode(linkFixture()) === "PUBLIC");
  check(
    "email_protected -> EMAIL",
    mapAccessMode(linkFixture({ email_protected: true })) === "EMAIL"
  );
  check(
    "email_authenticated -> EMAIL_VERIFIED",
    mapAccessMode(
      linkFixture({ email_protected: true, email_authenticated: true })
    ) === "EMAIL_VERIFIED"
  );

  // A password cannot be carried over, and that must surface as blocking so
  // the UI refuses to silently publish a previously-protected link.
  const pw = mapLinkSettings(linkFixture({ is_password_protected: true }));
  check(
    "password produces a blocking caveat",
    pw.caveats.some((c) => c.code === "password" && c.severity === "blocking")
  );

  // Confidential view means view-only; download must not survive as true.
  const conf = mapLinkSettings(
    linkFixture({ enable_confidential_view: true, allow_download: true })
  );
  check("confidential view forces downloads off", conf.settings.allowDownload === false);

  const wm = mapLinkSettings(
    linkFixture({
      enable_watermark: true,
      watermark_config: { text: "{{email}}", is_tiled: true, rotation: 45 },
    })
  );
  check("watermark stays enabled", wm.settings.watermark === true);
  check(
    "watermark styling reported as lossy",
    wm.caveats.some((c) => c.code === "watermark_style" && c.severity === "lossy")
  );

  // URL preservation is the headline promise; both branches must be right.
  const custom = planLinkUrl(
    linkFixture({ domain: "dataroom.acme.com", slug: "board-deck" })
  );
  check("custom-domain link is exactly preservable", custom.exactPreservable === true);
  check("custom-domain slug kept verbatim", custom.slug === "board-deck");

  const dflt = planLinkUrl(linkFixture());
  check("papermark.com link is not preservable", dflt.exactPreservable === false);
  check("default link reuses the link id as slug", dflt.slug === "lnk_1");

  check("slug sanitised", sanitizeSlug("a b/c!") === "a-b-c-");

  check(
    "group maps to allow list",
    JSON.stringify(
      mapGroupToAllowList({
        domains: ["acme.com", "@beta.io"],
        memberEmails: ["Bob@Example.com"],
      }).sort()
    ) === JSON.stringify(["@acme.com", "@beta.io", "bob@example.com"])
  );

  check("filename rebuilt from content type", fileNameFor("Deck", "application/pdf", "pdf") === "Deck.pdf");
  check("existing extension left alone", fileNameFor("Deck.pdf", "application/pdf", "pdf") === "Deck.pdf");

  check(
    "bare cookie token expanded to both names",
    normalizeCookie("abc123").includes("__Secure-next-auth.session-token=abc123")
  );
  check(
    "full cookie pair passed through",
    normalizeCookie("next-auth.session-token=xyz") === "next-auth.session-token=xyz"
  );

  // Name matching has to survive Papermark stripping the extension.
  const m = matchManualFiles(
    [
      { id: "d1", name: "Q3 Board Deck.pdf" },
      { id: "d2", name: "Cap Table.xlsx" },
      { id: "d3", name: "Missing.pdf" },
    ],
    [
      { key: "k1", name: "q3_board_deck.PDF", size: 1, contentType: "application/pdf", relativeDir: "" },
      { key: "k2", name: "Cap Table.xlsx", size: 1, contentType: "x", relativeDir: "" },
      { key: "k3", name: "Unrelated.pdf", size: 1, contentType: "x", relativeDir: "" },
    ]
  );
  check("fuzzy name match found both", m.matched.get("d1")?.key === "k1" && m.matched.get("d2")?.key === "k2");
  check("unmatched document reported", m.unmatchedDocuments.length === 1 && m.unmatchedDocuments[0].id === "d3");
  check("unmatched file reported", m.unmatchedFiles.length === 1 && m.unmatchedFiles[0].key === "k3");
}

// ------------------------------------------------------------------ e2e setup

async function seedFile(teamId: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  pdf.addPage([595, 842]).drawText("Imported", { x: 60, y: 760, size: 24, font });
  const bytes = Buffer.from(await pdf.save());

  const s3 = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  const key = `${teamId}/import-e2e/source.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET ?? "foyer",
      Key: key,
      Body: bytes,
      ContentType: "application/pdf",
    })
  );
  return { key, size: bytes.byteLength };
}

/** A plan exercising nesting, dataroom placement, domains and grants. */
function buildPlan(): ImportPlan {
  const settings = mapLinkSettings(linkFixture()).settings;
  return {
    scannedAt: new Date().toISOString(),
    folders: [
      { id: "f_root", name: "Investors", parentId: null, path: "investors", documentCount: 0 },
      { id: "f_child", name: "2026", parentId: "f_root", path: "investors/2026", documentCount: 1 },
    ],
    documents: [
      {
        id: "doc_1",
        name: "Board Deck",
        fileName: "Board Deck.pdf",
        folderId: "f_child",
        type: "pdf",
        contentType: "application/pdf",
        numPages: 1,
        external: false,
        externalUrl: null,
        sizeBytes: 1000,
      },
      {
        id: "doc_notion",
        name: "Handbook",
        fileName: "Handbook",
        folderId: null,
        type: "notion",
        contentType: null,
        numPages: null,
        external: true,
        externalUrl: "https://notion.so/handbook",
        sizeBytes: null,
      },
    ],
    datarooms: [
      {
        id: "dr_1",
        name: "Series B",
        description: "Diligence",
        folders: [
          { id: "drf_1", name: "Legal", parentId: null, orderIndex: 0 },
          { id: "drf_2", name: "Contracts", parentId: "drf_1", orderIndex: 1 },
        ],
        documents: [
          { id: "drd_join_1", documentId: "doc_1", name: "Board Deck", folderId: "drf_2", orderIndex: 3 },
        ],
      },
    ],
    links: [
      {
        id: "lnk_domain",
        name: "Investor deck",
        targetType: "document",
        documentId: "doc_1",
        dataroomId: null,
        currentUrl: "https://dataroom.acme.test/board-deck",
        domain: "dataroom.acme.test",
        slug: "board-deck",
        exactPreservable: true,
        audienceType: "general",
        groupId: null,
        isArchivedTarget: false,
        settings,
        caveats: [],
        permissions: [],
      },
      {
        id: "lnk_dr",
        name: "Series B room",
        targetType: "dataroom",
        documentId: null,
        dataroomId: "dr_1",
        currentUrl: "https://www.papermark.com/view/lnk_dr",
        domain: null,
        slug: "lnk_dr",
        exactPreservable: false,
        audienceType: "general",
        groupId: null,
        isArchivedTarget: false,
        settings: { ...settings, accessMode: "EMAIL" },
        caveats: [],
        // Grants reference Papermark ids and must be translated to local ones.
        // The document grant here uses the *join row* id, the harder of the
        // two forms Papermark may return.
        permissions: [
          { itemId: "drf_1", itemType: "dataroom_folder", canView: true, canDownload: false },
          { itemId: "drd_join_1", itemType: "dataroom_document", canView: true, canDownload: true },
        ],
      },
    ],
    domains: [{ domain: "dataroom.acme.test", linkCount: 1 }],
    visitors: [
      { id: "vis_1", email: "Investor@Example.com", verified: true, totalViews: 4, lastViewedAt: null },
    ],
    fileCount: 1,
    totalBytes: 1000,
  };
}

async function testRun() {
  console.log("\nimport run");

  const team = await db.team.upsert({
    where: { slug: "import-e2e" },
    update: {},
    create: { name: "Import E2E", slug: "import-e2e" },
  });

  // Clean slate so reruns are meaningful.
  await db.import.deleteMany({ where: { teamId: team.id } });
  await db.link.deleteMany({ where: { teamId: team.id } });
  await db.dataroom.deleteMany({ where: { teamId: team.id } });
  await db.document.deleteMany({ where: { teamId: team.id } });
  await db.folder.deleteMany({ where: { teamId: team.id } });
  await db.viewer.deleteMany({ where: { teamId: team.id } });
  await db.domain.deleteMany({ where: { teamId: team.id } });

  const source = await seedFile(team.id);
  const plan = buildPlan();
  const options: ImportOptions = {
    include: { documents: true, datarooms: true, links: true, visitors: true },
    placement: "wrap",
    wrapFolderName: "Papermark import",
    fileStrategy: "manual",
    manualFiles: {
      doc_1: {
        key: source.key,
        name: "Board Deck.pdf",
        size: source.size,
        contentType: "application/pdf",
      },
    },
  };

  const record = await db.import.create({
    data: {
      teamId: team.id,
      source: "PAPERMARK",
      status: "RUNNING",
      plan: plan as never,
      options: options as never,
    },
  });

  const total = await materializeItems(record.id, plan, options);
  check("work list built", total > 0, total);

  // Ordering is the correctness-critical part: containers must precede content.
  const ordered = await db.importItem.findMany({
    where: { importId: record.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { kind: true, sortOrder: true },
  });
  const firstIdx = (k: string) => ordered.findIndex((o) => o.kind === k);
  check("domains before links", firstIdx("DOMAIN") < firstIdx("LINK"));
  check("folders before documents", firstIdx("FOLDER") < firstIdx("DOCUMENT"));
  check("dataroom before its folders", firstIdx("DATAROOM") < firstIdx("DATAROOM_FOLDER"));
  check(
    "dataroom folders before placements",
    firstIdx("DATAROOM_FOLDER") < firstIdx("DATAROOM_DOCUMENT")
  );
  check("documents before links", firstIdx("DOCUMENT") < firstIdx("LINK"));

  let guard = 0;
  let result = await runStep(record.id);
  while (result.status === "running" && guard++ < 30) {
    result = await runStep(record.id);
  }
  check("run completed", result.status === "completed", result);
  check("nothing failed", result.failed === 0, result.failed);

  // ---- library ----
  const wrap = await db.folder.findFirst({
    where: { teamId: team.id, name: "Papermark import", parentId: null },
  });
  check("wrapper folder created", Boolean(wrap));

  const investors = await db.folder.findFirst({
    where: { teamId: team.id, name: "Investors" },
  });
  check("top folder nested under wrapper", investors?.parentId === wrap?.id);

  const y2026 = await db.folder.findFirst({ where: { teamId: team.id, name: "2026" } });
  check("nested folder parented correctly", y2026?.parentId === investors?.id);

  const deck = await db.document.findFirst({
    where: { teamId: team.id, name: "Board Deck" },
    include: { versions: true },
  });
  check("document created in right folder", deck?.folderId === y2026?.id);
  check("current version set", Boolean(deck?.currentVersionId));
  check("file bytes stored", (deck?.versions[0].fileSize ?? 0) > 0);
  check("document typed from filename", deck?.type === "PDF");

  const notion = await db.document.findFirst({
    where: { teamId: team.id, name: "Handbook" },
  });
  check("notion doc imported as external", notion?.type === "NOTION");
  check("notion url preserved", notion?.externalUrl === "https://notion.so/handbook");

  // ---- dataroom ----
  const dr = await db.dataroom.findFirst({ where: { teamId: team.id, name: "Series B" } });
  check("dataroom created", Boolean(dr));
  const legal = await db.dataroomFolder.findFirst({
    where: { dataroomId: dr!.id, name: "Legal" },
  });
  const contracts = await db.dataroomFolder.findFirst({
    where: { dataroomId: dr!.id, name: "Contracts" },
  });
  check("nested dataroom folder parented", contracts?.parentId === legal?.id);

  const placement = await db.dataroomDocument.findFirst({
    where: { dataroomId: dr!.id, documentId: deck!.id },
  });
  check("document placed in dataroom", Boolean(placement));
  check("placed into nested folder", placement?.folderId === contracts?.id);
  check("order index preserved", placement?.orderIndex === 3);

  // ---- links + domain ----
  const domain = await db.domain.findUnique({ where: { domain: "dataroom.acme.test" } });
  check("domain registered", domain?.teamId === team.id);
  check("domain left pending for DNS cutover", domain?.status === "PENDING");

  const domainLink = await db.link.findFirst({
    where: { teamId: team.id, name: "Investor deck" },
  });
  check("custom-domain link keeps its slug", domainLink?.slug === "board-deck");
  check("link bound to the domain", domainLink?.domainId === domain?.id);
  check("link points at the document", domainLink?.documentId === deck?.id);

  const drLink = await db.link.findFirst({
    where: { teamId: team.id, name: "Series B room" },
    include: { permissions: true },
  });
  check("dataroom link reuses papermark id as slug", drLink?.slug === "lnk_dr");
  check("dataroom link access mode mapped", drLink?.accessMode === "EMAIL");
  check("partial access disables fullAccess", drLink?.fullAccess === false);
  check("both grants translated", drLink?.permissions.length === 2, drLink?.permissions.length);
  check(
    "folder grant points at local dataroom folder",
    drLink?.permissions.some((p) => p.itemType === "DATAROOM_FOLDER" && p.itemId === legal?.id)
  );
  check(
    "document grant points at local placement",
    drLink?.permissions.some(
      (p) => p.itemType === "DATAROOM_DOCUMENT" && p.itemId === placement?.id && p.canDownload
    )
  );

  // ---- visitors ----
  const viewer = await db.viewer.findFirst({ where: { teamId: team.id } });
  check("visitor email normalised", viewer?.email === "investor@example.com");
  check("visitor verified flag kept", viewer?.verified === true);

  // ---- idempotency: another step must not duplicate anything ----
  const before = await db.document.count({ where: { teamId: team.id } });
  await runStep(record.id);
  const after = await db.document.count({ where: { teamId: team.id } });
  check("re-running creates no duplicates", before === after, { before, after });

  // ---- credentials wiped on completion ----
  const finished = await db.import.findUniqueOrThrow({ where: { id: record.id } });
  check("status completed", finished.status === "COMPLETED");
  check("api token cleared", finished.tokenCipher === null);
  check("session cookie cleared", finished.cookieCipher === null);

  // ---- deleting the receipt must not touch content ----
  await db.import.delete({ where: { id: record.id } });
  const survives = await db.document.count({ where: { teamId: team.id } });
  const linksSurvive = await db.link.count({ where: { teamId: team.id } });
  check("content survives deleting the import record", survives === after && linksSurvive === 2, {
    survives,
    linksSurvive,
  });
}

async function main() {
  testMapping();
  await testRun();
  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`
  );
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

void main();
