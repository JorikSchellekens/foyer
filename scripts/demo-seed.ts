/* Provisions the Foyer demo workspace: a team that looks like it has been in
   use for months - library, data rooms, links, 60 days of reading analytics,
   signature envelopes, notifications and settings.

   Deterministic (seeded RNG, derived ids) and idempotent: structural rows are
   upserted by stable id, analytics rows are rebuilt from scratch each run, and
   every date is computed relative to now so the 30-day chart and the
   "2 hours ago" rows are always populated.

   Run:  bun run scripts/demo-seed.ts
         bun run scripts/demo-seed.ts --reset   (delete the demo teams first)

   Only the two demo teams and their users are ever touched. */
import { createHash, scryptSync } from "crypto";
import { deflateSync } from "zlib";
import { PrismaClient, type Prisma } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import * as XLSX from "xlsx";

const db = new PrismaClient();
const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9002",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "foyer",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "foyer-secret",
  },
});
const BUCKET = process.env.S3_BUCKET ?? "foyer";

const TEAM_SLUG = "larkfield-instruments";
const TEAM2_SLUG = "harbour-lane-advisors";
const OWNER_EMAIL = "demo@larkfield.io";
const LINK_PASSWORD = "meridian-2026";
const API_KEY_PLAIN = "foyer_demo_a7Kq2Lm9Tz4WxRb6Yc1Nv8Ph";
const API_KEY_PLAIN_CI = "foyer_demo_ci_3Fj8Dq1Rs6Vt9Ln2Zb5Kx";

// ---------- determinism helpers ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260730);

/** Stable cuid-shaped id derived from a name, so every row upserts by id. */
const sid = (name: string) =>
  "c" + createHash("sha256").update(`foyer-demo:${name}`).digest("hex").slice(0, 24);
/** Stable opaque token (invites, signer links, webhook secrets). */
const tok = (name: string) =>
  createHash("sha256")
    .update(`foyer-demo-token:${name}`)
    .digest("base64url")
    .slice(0, 32);

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const chance = (p: number) => rng() < p;
/** Roughly normal, clamped - for durations that should cluster, not spread flat. */
const gauss = (mean: number, sd: number, lo: number, hi: number) => {
  const v = mean + (rng() + rng() + rng() - 1.5) * 2 * sd;
  return Math.max(lo, Math.min(hi, Math.round(v)));
};

const NOW = Date.now();
const DAY = 86400_000;
/** A timestamp `d` days ago at a given local time, never in the future. */
function atDay(d: number, hour: number, minute: number, second = 0) {
  const t = new Date(NOW - d * DAY);
  t.setHours(hour, minute, second, 0);
  // "Today at 18:00" is still ahead of us when the seed runs in the morning.
  while (t.getTime() > NOW) t.setTime(t.getTime() - DAY);
  return t;
}
/** Pull a session that would overrun the clock back into the past. */
function fitBefore(start: Date, seconds: number) {
  const end = start.getTime() + seconds * 1000;
  if (end <= NOW - 60_000) return start;
  return new Date(NOW - 60_000 - seconds * 1000 - randInt(0, 900) * 1000);
}
const hoursAgo = (h: number) => new Date(NOW - Math.round(h * 3600_000));
const daysFromNow = (d: number) => new Date(NOW + d * DAY);

/** Link password hashing, same salt:hash format as lib/tokens hashPassword. */
function hashPassword(password: string) {
  const salt = createHash("sha256")
    .update(`foyer-demo-salt:${password}`)
    .digest("hex")
    .slice(0, 32);
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
const hashApiKey = (key: string) =>
  createHash("sha256").update(key).digest("hex");

// ---------- tiny PNG writer (logos, banners, diagrams, signatures) ----------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

type Rgba = [number, number, number, number];

/** Minimal RGBA raster with the few primitives the demo art needs. */
class Raster {
  readonly w: number;
  readonly h: number;
  private px: Uint8Array;
  constructor(w: number, h: number, bg: Rgba = [0, 0, 0, 0]) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 4);
    this.rect(0, 0, w, h, bg);
  }
  private put(x: number, y: number, c: Rgba) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const a = c[3] / 255;
    if (a >= 1) {
      this.px[i] = c[0];
      this.px[i + 1] = c[1];
      this.px[i + 2] = c[2];
      this.px[i + 3] = 255;
      return;
    }
    for (let k = 0; k < 3; k++)
      this.px[i + k] = Math.round(this.px[i + k] * (1 - a) + c[k] * a);
    this.px[i + 3] = Math.max(this.px[i + 3], c[3]);
  }
  rect(x: number, y: number, w: number, h: number, c: Rgba) {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) this.put(i, j, c);
  }
  disc(cx: number, cy: number, r: number, c: Rgba) {
    for (let j = cy - r; j <= cy + r; j++)
      for (let i = cx - r; i <= cx + r; i++)
        if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) this.put(i, j, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Rgba, weight = 1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2 + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      if (weight <= 1) this.put(x, y, c);
      else this.disc(x, y, Math.floor(weight / 2), c);
    }
  }
  toPng(): Buffer {
    const stride = this.w * 4;
    const raw = Buffer.alloc((stride + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (stride + 1)] = 0;
      Buffer.from(this.px.buffer, y * stride, stride).copy(
        raw,
        y * (stride + 1) + 1
      );
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(raw, { level: 9 })),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const INK: Rgba = [22, 24, 29, 255];
const GREEN: Rgba = [23, 91, 71, 255];
const PAPER: Rgba = [250, 250, 248, 255];

/** Geometric brand mark: a doorway (the foyer motif) in library green. */
function buildLogo(): Buffer {
  const r = new Raster(256, 256, [23, 91, 71, 255]);
  r.rect(72, 96, 112, 160, PAPER);
  r.disc(128, 100, 56, PAPER);
  r.rect(96, 132, 64, 124, GREEN);
  r.disc(128, 132, 32, GREEN);
  r.rect(120, 176, 12, 12, PAPER);
  return r.toPng();
}

/** Banner: green field with a faint architectural rule pattern. */
function buildBanner(): Buffer {
  const r = new Raster(1600, 420, [16, 62, 50, 255]);
  for (let x = 0; x < 1600; x += 1) {
    const t = x / 1600;
    r.rect(x, 0, 1, 420, [
      Math.round(16 + 22 * t),
      Math.round(62 + 40 * t),
      Math.round(50 + 30 * t),
      255,
    ]);
  }
  for (let i = -420; i < 1600; i += 56)
    r.line(i, 420, i + 420, 0, [250, 250, 248, 26], 2);
  r.rect(0, 396, 1600, 4, [250, 250, 248, 60]);
  return r.toPng();
}

/** Abstract assembly diagram - stands in for a real engineering drawing. */
function buildDiagram(): Buffer {
  const r = new Raster(1600, 900, PAPER);
  r.rect(0, 0, 1600, 8, GREEN);
  const boxes = [
    [120, 160, 300, 170],
    [520, 120, 300, 130],
    [520, 330, 300, 130],
    [940, 160, 300, 170],
    [520, 560, 720, 190],
  ];
  for (const [x, y, w, h] of boxes) {
    r.rect(x, y, w, h, [231, 230, 224, 255]);
    r.rect(x + 3, y + 3, w - 6, h - 6, [255, 255, 255, 255]);
    r.rect(x, y, w, 6, GREEN);
    for (let i = 0; i < 4; i++)
      r.rect(x + 24, y + 34 + i * 22, w - 48 - i * 34, 8, [
        190,
        192,
        188,
        255,
      ]);
  }
  r.line(420, 245, 520, 185, INK, 3);
  r.line(420, 245, 520, 395, INK, 3);
  r.line(820, 185, 940, 245, INK, 3);
  r.line(820, 395, 940, 245, INK, 3);
  r.line(1090, 330, 1090, 560, INK, 3);
  r.line(270, 330, 270, 655, INK, 3);
  r.line(270, 655, 520, 655, INK, 3);
  for (let i = 0; i < 9; i++) r.disc(160 + i * 24, 820, 7, GREEN);
  return r.toPng();
}

/** A drawn-signature PNG, the shape the signing pad exports. */
function signaturePng(seed: number, tall = false): Buffer {
  const local = mulberry32(seed);
  const w = 560;
  const h = tall ? 200 : 170;
  const r = new Raster(w, h, [0, 0, 0, 0]);
  let x = 30;
  let y = h * 0.62;
  const amp = h * (0.2 + local() * 0.12);
  while (x < w - 40) {
    const step = 6 + local() * 8;
    const nx = x + step;
    const ny =
      h * 0.6 -
      Math.sin((x / w) * Math.PI * (3 + local())) * amp +
      (local() - 0.5) * 10;
    r.line(x, y, nx, ny, [16, 24, 40, 235], 4);
    x = nx;
    y = ny;
  }
  // A closing flourish, the way a real hand lifts off.
  r.line(w - 46, y, w - 20, h * 0.3, [16, 24, 40, 200], 3);
  return r.toPng();
}
const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

// ---------- prose corpus ----------

type Theme = "corporate" | "financial" | "legal" | "product" | "commercial" | "security";

const SENTENCES: Record<Theme, readonly string[]> = {
  corporate: [
    "The company was incorporated in England and Wales and has maintained a single class of ordinary shares since the seed round closed.",
    "All statutory registers are held electronically and were last reconciled against Companies House filings at the end of the preceding quarter.",
    "The board comprises two founders, one investor director and an independent chair appointed at the Series A.",
    "Written resolutions passed since the last annual meeting are listed in the appendix together with the consent thresholds that applied.",
    "No shareholder holds a veto over the matters reserved to the board other than those set out in the articles.",
    "Group structure remains deliberately flat: a single trading entity with one dormant subsidiary retained for a legacy trademark.",
    "Directors' interests have been disclosed in full and no related-party transaction exceeded the materiality threshold agreed with the auditor.",
    "The option pool was refreshed at the Series A and currently stands at eleven per cent of the fully diluted capital.",
    "Insurance cover for directors and officers was renewed on the same terms with an increased aggregate limit.",
    "Registered office and trading premises are held under a single lease expiring in the second half of the next financial year.",
  ],
  financial: [
    "Revenue in the period grew forty-one per cent year on year, driven by expansion inside existing industrial accounts.",
    "Gross margin improved by three hundred basis points as the second-generation sensor module displaced bought-in assemblies.",
    "Annual recurring revenue is recognised monthly and excludes hardware sold outright, which is reported separately.",
    "Net revenue retention was one hundred and nineteen per cent, with churn concentrated in two pilot accounts that never reached production.",
    "Operating expenses grew more slowly than revenue for the fourth consecutive quarter, and the plan holds that pattern through the forecast period.",
    "Cash conversion remains seasonal: the fourth quarter carries roughly a third of annual hardware shipments and the receivable that goes with it.",
    "The model assumes no price increases on the installed base and no revenue from the two opportunities still in legal review.",
    "Headcount is the dominant cost line and the plan phases hiring against booked pipeline rather than calendar quarters.",
    "Capital expenditure is limited to test rigs and calibration equipment; no owned manufacturing capacity is contemplated.",
    "The downside case holds revenue flat from the current run rate and still reaches breakeven inside the forecast horizon.",
    "Deferred revenue is disclosed gross and unwinds over an average contract term of twenty-eight months.",
    "Working capital assumptions follow the historical pattern of sixty-two days sales outstanding and forty-five days payable.",
  ],
  legal: [
    "This agreement is governed by the laws of England and Wales and the parties submit to the exclusive jurisdiction of its courts.",
    "Each party shall keep confidential all information disclosed by the other and shall use it only for the permitted purpose.",
    "Liability for indirect or consequential loss is excluded in all cases, and aggregate liability is capped at the fees paid in the preceding twelve months.",
    "The supplier warrants that the deliverables will conform in all material respects to the specification for a period of twelve months from acceptance.",
    "Either party may terminate for material breach that remains unremedied thirty days after written notice.",
    "Intellectual property created in the course of performance vests in the customer on payment, save for pre-existing materials which remain with the supplier.",
    "Personal data is processed only on documented instructions and in accordance with the data processing addendum appended to this agreement.",
    "Neither party shall be liable for failure to perform caused by events beyond its reasonable control, provided it notifies the other promptly.",
    "Notices take effect on delivery to the addresses set out in the schedule, or on the next business day if delivered outside working hours.",
    "The parties agree that damages alone may be an inadequate remedy for breach of the confidentiality provisions.",
    "Assignment requires prior written consent, which shall not be unreasonably withheld in the case of an intra-group reorganisation.",
    "Any variation to this agreement is effective only if made in writing and signed by an authorised representative of each party.",
  ],
  product: [
    "The platform is organised around three layers: the sensing module, the gateway firmware and the analysis service that customers actually log into.",
    "Calibration now runs on the device rather than in the cloud, which removed a dependency that caused most of last year's field incidents.",
    "The next release consolidates two overlapping alerting paths into a single rules engine, reducing configuration surface for installers.",
    "Field trials at three sites confirmed that drift over ninety days stays inside the tolerance the specification promises.",
    "Firmware updates are staged, signed and reversible; a failed update returns the device to the previously known-good image.",
    "The roadmap is sequenced by installation effort rather than novelty, because time on a customer site is the scarcest resource in this market.",
    "Instrumentation was added across the ingest path so that latency regressions are visible before a customer reports them.",
    "The integration surface is deliberately small: one authenticated stream out, one configuration document in.",
    "Hardware and software release trains were decoupled this year, which is why the software cadence improved without a change in headcount.",
    "Accessibility and offline behaviour are treated as requirements rather than refinements, since many installations sit in poorly connected plant rooms.",
  ],
  commercial: [
    "The pipeline is concentrated in industrial process manufacturers with more than four hundred monitored assets per site.",
    "Average contract value has risen for six consecutive quarters as pilots convert into multi-site rollouts.",
    "Sales cycles average one hundred and forty days from first meeting to signature, and shorten materially where a reference site is nearby.",
    "Two channel partners now originate roughly a quarter of new opportunities in continental Europe.",
    "Reference customers are willing to speak to prospective investors under the usual confidentiality arrangements.",
    "Pricing is per monitored asset with a platform fee that scales in bands rather than continuously.",
    "Win rates against the incumbent improve sharply once a technical evaluation is agreed, which is why evaluation conversion is the tracked metric.",
    "Renewal conversations begin ninety days before term and are owned by the account team rather than a separate renewals function.",
    "The commercial team is deliberately small and paired with field engineers on every material opportunity.",
    "Expansion revenue comes predominantly from additional sites rather than from upselling additional modules.",
  ],
  security: [
    "Access to production systems requires hardware-backed authentication and is granted for a fixed period against a named change record.",
    "All data is encrypted in transit and at rest, and encryption keys are rotated annually or on any suspected compromise.",
    "Backups are taken nightly, retained for thirty-five days and restored into a clean environment quarterly to prove they work.",
    "Sub-processors are listed publicly and customers receive thirty days notice of any addition.",
    "Penetration testing is carried out annually by an external firm and the summary report is available under a confidentiality agreement.",
    "Incident response follows a documented runbook with a four-hour target for customer notification of any confirmed breach.",
    "Logging is centralised, immutable for ninety days and covers every administrative action against customer data.",
    "Personnel receive security training on joining and annually thereafter, with completion tracked in the people system.",
    "Segregation between customer tenants is enforced at the data layer rather than solely in application code.",
    "The company maintains a register of processing activities and reviews it whenever a new data flow is introduced.",
  ],
};

function paragraph(theme: Theme): string {
  const pool = SENTENCES[theme];
  const n = randInt(3, 5);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let s = pick(pool);
    let guard = 0;
    while (out.includes(s) && guard++ < 6) s = pick(pool);
    out.push(s);
  }
  return out.join(" ");
}

// ---------- PDF generation ----------

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const A4: [number, number] = [595, 842];
const MARGIN = 64;
const COL = A4[0] - MARGIN * 2;

type PdfSpec = {
  title: string;
  subtitle: string;
  pages: number;
  headings: readonly string[];
  theme: Theme;
  /** Page that carries the numbers table - the one visitors linger on. */
  keyPage?: number;
  reference: string;
};

async function buildPdf(spec: PdfSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(spec.title);
  pdf.setAuthor("Larkfield Instruments Ltd");
  pdf.setSubject(spec.subtitle);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(23 / 255, 91 / 255, 71 / 255);
  const ink = rgb(22 / 255, 24 / 255, 29 / 255);
  const grey = rgb(107 / 255, 111 / 255, 118 / 255);
  const total = spec.pages;

  // --- title page ---
  {
    const p = pdf.addPage(A4);
    p.drawRectangle({ x: 0, y: 806, width: A4[0], height: 36, color: green });
    p.drawText("LARKFIELD INSTRUMENTS", {
      x: MARGIN,
      y: 818,
      size: 10,
      font: sansBold,
      color: rgb(1, 1, 1),
    });
    let y = 620;
    for (const line of wrap(spec.title, serifBold, 30, COL)) {
      p.drawText(line, { x: MARGIN, y, size: 30, font: serifBold, color: ink });
      y -= 38;
    }
    y -= 8;
    for (const line of wrap(spec.subtitle, serif, 14, COL - 60)) {
      p.drawText(line, { x: MARGIN, y, size: 14, font: serif, color: grey });
      y -= 20;
    }
    p.drawLine({
      start: { x: MARGIN, y: y - 18 },
      end: { x: MARGIN + 160, y: y - 18 },
      thickness: 1.5,
      color: green,
    });
    const meta = [
      `Reference ${spec.reference}`,
      `Prepared ${new Date(NOW).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`,
      `${total} pages`,
    ];
    let my = y - 46;
    for (const m of meta) {
      p.drawText(m, { x: MARGIN, y: my, size: 10, font: sans, color: grey });
      my -= 15;
    }
    p.drawText(
      "Strictly confidential. Circulated for the sole purpose of the recipient's evaluation.",
      { x: MARGIN, y: 60, size: 8.5, font: sans, color: grey }
    );
  }

  // --- content pages ---
  for (let n = 2; n <= total; n++) {
    const p = pdf.addPage(A4);
    const heading = spec.headings[(n - 2) % spec.headings.length];
    p.drawText(heading, {
      x: MARGIN,
      y: 762,
      size: 15,
      font: serifBold,
      color: ink,
    });
    p.drawLine({
      start: { x: MARGIN, y: 752 },
      end: { x: A4[0] - MARGIN, y: 752 },
      thickness: 0.75,
      color: green,
    });
    let y = 726;

    if (n === spec.keyPage) {
      // A numbers table: the page every reader stops on.
      const cols = ["", "FY2024", "FY2025", "FY2026E", "FY2027E"];
      const rows = [
        ["Revenue (GBP 000)", "4,180", "6,940", "11,600", "18,250"],
        ["Gross margin", "58%", "61%", "64%", "66%"],
        ["Adjusted EBITDA", "(2,310)", "(1,480)", "(240)", "2,110"],
        ["Annual recurring revenue", "2,760", "4,810", "8,400", "13,900"],
        ["Monitored assets (000)", "61", "104", "186", "298"],
        ["Net revenue retention", "112%", "119%", "121%", "122%"],
      ];
      const xs = [MARGIN, MARGIN + 220, MARGIN + 290, MARGIN + 360, MARGIN + 434];
      cols.forEach((c, i) =>
        p.drawText(c, { x: xs[i], y, size: 9.5, font: sansBold, color: green })
      );
      y -= 8;
      p.drawLine({
        start: { x: MARGIN, y },
        end: { x: A4[0] - MARGIN, y },
        thickness: 0.5,
        color: grey,
      });
      y -= 16;
      for (const row of rows) {
        row.forEach((c, i) =>
          p.drawText(c, {
            x: xs[i],
            y,
            size: 9.5,
            font: i === 0 ? sans : sans,
            color: i === 0 ? ink : grey,
          })
        );
        y -= 18;
      }
      y -= 12;
      p.drawText(
        "Figures for FY2026 onward are management estimates and are not audited.",
        { x: MARGIN, y, size: 8.5, font: sans, color: grey }
      );
      y -= 26;
    }

    while (y > 110) {
      const lines = wrap(paragraph(spec.theme), serif, 10.5, COL);
      for (const line of lines) {
        if (y < 100) break;
        p.drawText(line, { x: MARGIN, y, size: 10.5, font: serif, color: ink });
        y -= 15.5;
      }
      y -= 12;
    }

    p.drawText(spec.title, {
      x: MARGIN,
      y: 56,
      size: 8,
      font: sans,
      color: grey,
    });
    const label = `${n} / ${total}`;
    p.drawText(label, {
      x: A4[0] - MARGIN - sans.widthOfTextAtSize(label, 8),
      y: 56,
      size: 8,
      font: sans,
      color: grey,
    });
  }

  return pdf.save();
}

/** The stamped, completed copy: the source pages plus a certificate page. */
async function buildSignedPdf(
  source: Uint8Array,
  title: string,
  signers: { name: string; email: string; when: Date; ip: string }[]
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const green = rgb(23 / 255, 91 / 255, 71 / 255);
  const grey = rgb(107 / 255, 111 / 255, 118 / 255);
  const p = pdf.addPage(A4);
  p.drawRectangle({ x: 0, y: 806, width: A4[0], height: 36, color: green });
  p.drawText("CERTIFICATE OF COMPLETION", {
    x: MARGIN,
    y: 818,
    size: 10,
    font: sans,
    color: rgb(1, 1, 1),
  });
  p.drawText(title, { x: MARGIN, y: 740, size: 20, font: serifBold });
  let y = 690;
  for (const s of signers) {
    p.drawText(`${s.name} <${s.email}>`, { x: MARGIN, y, size: 11, font: sans });
    y -= 16;
    p.drawText(
      `Signed ${s.when.toISOString()} from ${s.ip} · Chrome on macOS`,
      { x: MARGIN, y, size: 9, font: sans, color: grey }
    );
    y -= 28;
  }
  p.drawText("Sealed by Foyer. Any alteration invalidates the hash below.", {
    x: MARGIN,
    y: 100,
    size: 9,
    font: sans,
    color: grey,
  });
  return pdf.save();
}

// ---------- storage ----------

let uploads = 0;
async function put(key: string, body: Buffer | Uint8Array, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(body),
      ContentType: contentType,
    })
  );
  uploads++;
  return key;
}

// ---------- people ----------

type Member = {
  key: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

const MEMBERS: Member[] = [
  { key: "avery", email: OWNER_EMAIL, name: "Avery Holt", role: "OWNER" },
  { key: "priya", email: "priya.raman@larkfield.io", name: "Priya Raman", role: "ADMIN" },
  { key: "tom", email: "tom.eriksen@larkfield.io", name: "Tom Eriksen", role: "ADMIN" },
  { key: "sasha", email: "sasha.lindqvist@larkfield.io", name: "Sasha Lindqvist", role: "MEMBER" },
  { key: "daniel", email: "daniel.okafor@larkfield.io", name: "Daniel Okafor", role: "MEMBER" },
  { key: "ines", email: "ines.moreau@larkfield.io", name: "Ines Moreau", role: "MEMBER" },
];

// ---------- library catalogue ----------

type FolderSpec = { key: string; name: string; parent?: string };

const FOLDERS: FolderSpec[] = [
  { key: "company", name: "Company" },
  { key: "company-records", name: "Corporate records", parent: "company" },
  { key: "company-board", name: "Board", parent: "company" },
  { key: "finance", name: "Finance" },
  { key: "finance-model", name: "Models", parent: "finance" },
  { key: "finance-stat", name: "Statutory accounts", parent: "finance" },
  { key: "legal", name: "Legal" },
  { key: "legal-contracts", name: "Contracts", parent: "legal" },
  { key: "legal-contracts-supply", name: "Supply", parent: "legal-contracts" },
  { key: "legal-policies", name: "Policies", parent: "legal" },
  { key: "legal-ip", name: "Intellectual property", parent: "legal" },
  { key: "product", name: "Product" },
  { key: "product-roadmap", name: "Roadmap", parent: "product" },
  { key: "commercial", name: "Commercial" },
  { key: "commercial-refs", name: "Customer references", parent: "commercial" },
];

type Kind = "pdf" | "png" | "csv" | "xlsx" | "md" | "txt";

type DocSpec = {
  key: string;
  name: string;
  file: string;
  kind: Kind;
  folder?: string;
  pages?: number;
  theme?: Theme;
  headings?: readonly string[];
  keyPage?: number;
  subtitle?: string;
  reference?: string;
  /** Extra historical versions, newest last; exercises version history. */
  extraVersions?: { note: string; daysAgo: number }[];
};

const DOCS: DocSpec[] = [
  {
    key: "deck",
    name: "Series B investor deck",
    file: "larkfield-series-b-deck.pdf",
    kind: "pdf",
    pages: 24,
    theme: "commercial",
    keyPage: 11,
    subtitle: "Industrial sensing at plant scale - Series B materials",
    reference: "LI-IR-2026-014",
    headings: [
      "The problem with plant-floor telemetry",
      "What Larkfield does",
      "Why now",
      "Product architecture",
      "Installed base and expansion",
      "Financial summary",
      "Unit economics",
      "Go-to-market",
      "Competitive landscape",
      "Team",
      "Use of proceeds",
      "The ask",
    ],
    extraVersions: [
      { note: "First circulated version, pre-Q1 numbers.", daysAgo: 74 },
      { note: "Updated with audited FY2025 figures.", daysAgo: 41 },
    ],
  },
  {
    key: "model",
    name: "Financial model summary FY26-FY29",
    file: "financial-model-summary.pdf",
    kind: "pdf",
    folder: "finance-model",
    pages: 14,
    theme: "financial",
    keyPage: 4,
    subtitle: "Base, upside and downside cases with working-capital detail",
    reference: "LI-FIN-2026-031",
    extraVersions: [{ note: "Reforecast after the June board meeting.", daysAgo: 22 }],
    headings: [
      "Basis of preparation",
      "Revenue build",
      "Cost base and hiring plan",
      "Summary financials",
      "Working capital",
      "Cash and runway",
      "Sensitivities",
      "Downside case",
    ],
  },
  {
    key: "dd-memo",
    name: "Due diligence memo - Project Meridian",
    file: "due-diligence-memo-meridian.pdf",
    kind: "pdf",
    folder: "company-records",
    pages: 18,
    theme: "corporate",
    keyPage: 9,
    subtitle: "Findings on the proposed acquisition of Kesten Works GmbH",
    reference: "LI-CORP-2026-008",
    headings: [
      "Scope and limitations",
      "Corporate and ownership",
      "Financial findings",
      "Commercial contracts",
      "Employment matters",
      "Intellectual property",
      "Litigation and disputes",
      "Integration risks",
      "Recommendations",
    ],
  },
  {
    key: "cap-table",
    name: "Capitalisation table - post Series A",
    file: "cap-table-post-series-a.pdf",
    kind: "pdf",
    folder: "company-records",
    pages: 4,
    theme: "corporate",
    keyPage: 2,
    subtitle: "Fully diluted ownership including the refreshed option pool",
    reference: "LI-CORP-2026-002",
    headings: ["Ownership summary", "Option pool", "Convertible instruments"],
  },
  {
    key: "msa",
    name: "Master services agreement - template v4",
    file: "msa-template-v4.pdf",
    kind: "pdf",
    folder: "legal-contracts",
    pages: 14,
    theme: "legal",
    subtitle: "Standard form used for platform subscriptions since January",
    reference: "LI-LEG-2026-004",
    headings: [
      "Definitions",
      "Scope of services",
      "Fees and payment",
      "Warranties",
      "Liability",
      "Data protection",
      "Term and termination",
      "General",
    ],
  },
  {
    key: "board-pack",
    name: "Board pack - Q2 2026",
    file: "board-pack-q2-2026.pdf",
    kind: "pdf",
    folder: "company-board",
    pages: 40,
    theme: "financial",
    keyPage: 6,
    subtitle: "Papers for the meeting of the board of directors",
    reference: "LI-BRD-2026-Q2",
    headings: [
      "Agenda and apologies",
      "Chief executive's report",
      "Financial review",
      "Commercial review",
      "Product and engineering",
      "People and organisation",
      "Risk register",
      "Matters reserved to the board",
      "Any other business",
    ],
  },
  {
    key: "nda",
    name: "Mutual non-disclosure agreement",
    file: "mutual-nda.pdf",
    kind: "pdf",
    folder: "legal-contracts",
    pages: 3,
    theme: "legal",
    subtitle: "Standard mutual form for investor and customer diligence",
    reference: "LI-LEG-2026-001",
    headings: ["Confidential information", "Permitted use and term"],
  },
  {
    key: "roadmap",
    name: "Product roadmap 2026-2027",
    file: "product-roadmap.pdf",
    kind: "pdf",
    folder: "product-roadmap",
    pages: 9,
    theme: "product",
    subtitle: "Sequenced by installation effort, not by novelty",
    reference: "LI-PRD-2026-019",
    headings: [
      "Principles",
      "Now",
      "Next",
      "Later",
      "Platform investments",
      "Dependencies",
    ],
  },
  {
    key: "security",
    name: "Security and compliance overview",
    file: "security-compliance-overview.pdf",
    kind: "pdf",
    folder: "legal-policies",
    pages: 11,
    theme: "security",
    subtitle: "Controls, sub-processors and incident response",
    reference: "LI-SEC-2026-006",
    headings: [
      "Governance",
      "Access control",
      "Encryption and key management",
      "Resilience and backups",
      "Sub-processors",
      "Incident response",
      "Personnel",
    ],
  },
  {
    key: "refs",
    name: "Customer reference pack",
    file: "customer-reference-pack.pdf",
    kind: "pdf",
    folder: "commercial-refs",
    pages: 7,
    theme: "commercial",
    subtitle: "Six production deployments with named contacts",
    reference: "LI-COM-2026-022",
    headings: [
      "How to use this pack",
      "Process manufacturing",
      "Water and utilities",
      "Pharmaceutical",
      "Contact protocol",
    ],
  },
  {
    key: "unit-econ",
    name: "Unit economics deep dive",
    file: "unit-economics.pdf",
    kind: "pdf",
    folder: "finance-model",
    pages: 6,
    theme: "financial",
    keyPage: 3,
    subtitle: "Payback, retention and cost to serve by segment",
    reference: "LI-FIN-2026-027",
    headings: ["Method", "Acquisition cost", "Cost to serve", "Payback"],
  },
  {
    key: "supply",
    name: "Manufacturing supply agreement - Kesten Works",
    file: "supply-agreement-kesten.pdf",
    kind: "pdf",
    folder: "legal-contracts-supply",
    pages: 21,
    theme: "legal",
    subtitle: "Contract manufacture of the Meridian sensor module",
    reference: "LI-LEG-2025-046",
    headings: [
      "Definitions",
      "Forecasts and orders",
      "Quality and acceptance",
      "Pricing and indexation",
      "Tooling and equipment",
      "Warranty and recall",
      "Term and exit",
      "Schedules",
    ],
  },
  {
    key: "esop",
    name: "Employee share option plan rules",
    file: "esop-rules.pdf",
    kind: "pdf",
    folder: "company-records",
    pages: 16,
    theme: "legal",
    subtitle: "Rules adopted at the Series A and last amended in March",
    reference: "LI-CORP-2025-011",
    headings: [
      "Grant and eligibility",
      "Vesting",
      "Exercise",
      "Leavers",
      "Exit provisions",
      "Administration",
    ],
  },
  {
    key: "annual-report",
    name: "Annual report and accounts 2025",
    file: "annual-report-2025.pdf",
    kind: "pdf",
    folder: "finance-stat",
    pages: 33,
    theme: "financial",
    keyPage: 8,
    subtitle: "Report of the directors and audited financial statements",
    reference: "LI-FIN-2025-ANN",
    headings: [
      "Strategic report",
      "Directors' report",
      "Independent auditor's report",
      "Income statement",
      "Balance sheet",
      "Cash flow statement",
      "Notes to the accounts",
    ],
  },
  {
    key: "patents",
    name: "Patent portfolio summary",
    file: "patent-portfolio.pdf",
    kind: "pdf",
    folder: "legal-ip",
    pages: 8,
    theme: "legal",
    subtitle: "Granted rights, pending applications and territories",
    reference: "LI-IP-2026-003",
    headings: ["Granted", "Pending", "Territories", "Freedom to operate"],
  },
  {
    key: "insurance",
    name: "Insurance certificates 2026",
    file: "insurance-certificates-2026.pdf",
    kind: "pdf",
    folder: "company-records",
    pages: 5,
    theme: "corporate",
    subtitle: "Employers, public and product liability, and D&O cover",
    reference: "LI-CORP-2026-017",
    headings: ["Summary of cover", "Certificates", "Claims history"],
  },
  {
    key: "dpa",
    name: "Data processing addendum",
    file: "data-processing-addendum.pdf",
    kind: "pdf",
    folder: "legal-policies",
    pages: 6,
    theme: "security",
    subtitle: "Appended to every platform subscription",
    reference: "LI-LEG-2026-009",
    headings: ["Roles", "Instructions", "Sub-processors", "Transfers", "Audit"],
  },
  {
    key: "term-sheet",
    name: "Series B term sheet (draft)",
    file: "series-b-term-sheet-draft.pdf",
    kind: "pdf",
    folder: "company-records",
    pages: 3,
    theme: "corporate",
    subtitle: "Non-binding heads of terms circulated to the lead investor",
    reference: "LI-IR-2026-021",
    headings: ["Economics", "Governance and consents"],
  },
  {
    key: "statutory",
    name: "Statutory accounts FY2025",
    file: "statutory-accounts-fy2025.pdf",
    kind: "pdf",
    folder: "finance-stat",
    pages: 28,
    theme: "financial",
    keyPage: 7,
    subtitle: "Filed accounts with notes and auditor's opinion",
    reference: "LI-FIN-2025-STAT",
    headings: [
      "Company information",
      "Accounting policies",
      "Primary statements",
      "Notes",
      "Related parties",
    ],
  },
  {
    key: "pipeline",
    name: "Sales pipeline review - July",
    file: "pipeline-review-july.pdf",
    kind: "pdf",
    folder: "commercial",
    pages: 6,
    theme: "commercial",
    keyPage: 3,
    subtitle: "Weighted pipeline by stage, region and partner origination",
    reference: "LI-COM-2026-031",
    headings: ["Summary", "By stage", "By region", "Risks"],
  },
  {
    key: "diagram",
    name: "Meridian sensor array - assembly diagram",
    file: "meridian-assembly-diagram.png",
    kind: "png",
    folder: "product",
  },
  {
    key: "revenue-csv",
    name: "Revenue by segment FY2025",
    file: "revenue-by-segment-fy2025.csv",
    kind: "csv",
    folder: "finance",
  },
  {
    key: "headcount",
    name: "Headcount plan FY2026",
    file: "headcount-plan-fy2026.xlsx",
    kind: "xlsx",
    folder: "finance",
  },
  {
    key: "integration-notes",
    name: "Integration notes - Kesten Works",
    file: "integration-notes.md",
    kind: "md",
    folder: "company-records",
  },
  {
    key: "room-guide",
    name: "How to use this data room",
    file: "data-room-guide.txt",
    kind: "txt",
  },
];

const CSV_BODY = `Segment,FY2024 revenue,FY2025 revenue,Growth,Gross margin
Process manufacturing,1840,3260,77%,63%
Water and utilities,1120,1680,50%,59%
Pharmaceutical,640,1210,89%,68%
Energy,410,560,37%,54%
Other,170,230,35%,49%
Total,4180,6940,66%,61%
`;

const MD_BODY = `# Integration notes - Kesten Works

Working notes kept alongside the diligence memo. Not a board paper.

## Where the value is

- Contract manufacture moves in-house, removing a single-supplier dependency
  on the Meridian sensor module.
- The Munich test facility is the asset that is hardest to replicate; the
  building lease runs to 2031.
- Roughly nine of the forty-one staff are calibration engineers. Retaining
  them is the whole point of the transaction.

## Open questions

1. Which of the two ERP systems survives, and who owns the cutover plan.
2. Whether the German works council process runs before or after signing.
3. Treatment of the tooling that Larkfield already paid for.

## Sequencing

| Phase | Weeks | Owner |
| --- | --- | --- |
| Confirmatory diligence | 1-4 | Priya Raman |
| Signing and notification | 5-6 | Tom Eriksen |
| Day one readiness | 6-10 | Daniel Okafor |
| Systems consolidation | 10-26 | Ines Moreau |
`;

const TXT_BODY = `HOW TO USE THIS DATA ROOM

Everything is organised in five sections. Start with 01 Corporate if you are
new to the company; start with 02 Financials if you have already seen the deck.

01 Corporate       Constitutional documents, cap table, board matters.
02 Financials      Audited accounts, management figures and the model.
03 Legal           Standard forms, material contracts and IP.
04 Commercial      Pipeline, reference customers, pricing.
05 Product         Roadmap, architecture and security posture.

Questions can be asked in the room itself; they reach the deal team directly
and are answered in the order received. Please do not forward the link. If a
colleague needs access, ask us and we will issue one for them so that the
audit trail stays accurate.

Larkfield Instruments Ltd, registered in England and Wales.
`;

// ---------- audience ----------

type Persona = {
  email: string;
  firm: string;
  country: string;
  city: string;
  device: "Desktop" | "Mobile" | "Tablet";
  browser: string;
  os: string;
  /** Daily probability of a session, before weekday/recency shaping. */
  intensity: number;
  /** How far through a document they read, 0..1. */
  depth: number;
  links: string[];
  verified: boolean;
  downloads: number;
};

const PERSONAS: Persona[] = [
  { email: "m.calloway@brightwatercapital.com", firm: "Brightwater Capital", country: "United Kingdom", city: "London", device: "Desktop", browser: "Chrome", os: "macOS", intensity: 0.34, depth: 0.95, links: ["series-b-lead", "financial-model", "cap-table", "deck"], verified: true, downloads: 0.5 },
  { email: "j.pereira@brightwatercapital.com", firm: "Brightwater Capital", country: "United Kingdom", city: "London", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.26, depth: 0.82, links: ["series-b-lead", "financial-model", "deck"], verified: true, downloads: 0.3 },
  { email: "h.osei@brightwatercapital.com", firm: "Brightwater Capital", country: "United Kingdom", city: "London", device: "Mobile", browser: "Safari", os: "iOS", intensity: 0.12, depth: 0.3, links: ["series-b-lead", "deck"], verified: true, downloads: 0 },
  { email: "t.nakamura@meridiangrowth.vc", firm: "Meridian Growth Partners", country: "Germany", city: "Berlin", device: "Desktop", browser: "Chrome", os: "macOS", intensity: 0.28, depth: 0.88, links: ["series-b-nda", "deck", "financial-model"], verified: true, downloads: 0.4 },
  { email: "l.brandt@meridiangrowth.vc", firm: "Meridian Growth Partners", country: "Germany", city: "Berlin", device: "Desktop", browser: "Firefox", os: "Linux", intensity: 0.15, depth: 0.55, links: ["series-b-nda", "deck"], verified: true, downloads: 0.1 },
  { email: "s.whitfield@northaxis.com", firm: "Northaxis Partners", country: "United States", city: "New York", device: "Desktop", browser: "Chrome", os: "macOS", intensity: 0.22, depth: 0.74, links: ["series-b-open", "deck", "annual-report"], verified: false, downloads: 0.2 },
  { email: "r.okonkwo@northaxis.com", firm: "Northaxis Partners", country: "United States", city: "New York", device: "Desktop", browser: "Edge", os: "Windows", intensity: 0.1, depth: 0.4, links: ["series-b-open", "deck"], verified: false, downloads: 0 },
  { email: "d.aziz@kestrelbridge.com", firm: "Kestrel Bridge Advisors", country: "United Kingdom", city: "London", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.3, depth: 0.9, links: ["meridian-diligence", "series-b-lead"], verified: true, downloads: 0.45 },
  { email: "c.hallberg@kestrelbridge.com", firm: "Kestrel Bridge Advisors", country: "Sweden", city: "Stockholm", device: "Desktop", browser: "Chrome", os: "macOS", intensity: 0.16, depth: 0.62, links: ["meridian-diligence"], verified: true, downloads: 0.15 },
  { email: "n.fairweather@hollowayfield.com", firm: "Holloway Field LLP", country: "United Kingdom", city: "London", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.24, depth: 0.85, links: ["series-b-restricted", "msa-template", "meridian-diligence"], verified: true, downloads: 0.55 },
  { email: "p.sandhu@hollowayfield.com", firm: "Holloway Field LLP", country: "United Kingdom", city: "Manchester", device: "Desktop", browser: "Firefox", os: "Windows", intensity: 0.13, depth: 0.6, links: ["msa-template", "series-b-restricted"], verified: true, downloads: 0.2 },
  { email: "e.kowalski@aldergate.com", firm: "Aldergate Bank", country: "Germany", city: "Frankfurt", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.18, depth: 0.66, links: ["deck", "annual-report", "series-b-open"], verified: false, downloads: 0.1 },
  { email: "g.villanueva@aldergate.com", firm: "Aldergate Bank", country: "Spain", city: "Madrid", device: "Tablet", browser: "Safari", os: "iPadOS", intensity: 0.08, depth: 0.35, links: ["deck"], verified: false, downloads: 0 },
  { email: "a.strand@sandhurstventures.com", firm: "Sandhurst Ventures", country: "United Kingdom", city: "Cambridge", device: "Desktop", browser: "Chrome", os: "macOS", intensity: 0.2, depth: 0.7, links: ["series-b-open", "deck", "security-overview"], verified: false, downloads: 0.2 },
  { email: "b.iversen@sandhurstventures.com", firm: "Sandhurst Ventures", country: "Norway", city: "Oslo", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.09, depth: 0.28, links: ["deck"], verified: false, downloads: 0 },
  { email: "k.reinhardt@kestenworks.de", firm: "Kesten Works", country: "Germany", city: "Munich", device: "Desktop", browser: "Edge", os: "Windows", intensity: 0.22, depth: 0.78, links: ["meridian-diligence"], verified: true, downloads: 0.35 },
  { email: "w.schroeder@kestenworks.de", firm: "Kesten Works", country: "Germany", city: "Munich", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.14, depth: 0.52, links: ["meridian-diligence"], verified: true, downloads: 0.1 },
  { email: "f.mbeki@northlakehealth.com", firm: "Northlake Health", country: "Canada", city: "Toronto", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.19, depth: 0.68, links: ["northlake-diligence", "security-overview"], verified: false, downloads: 0.25 },
  { email: "s.duval@northlakehealth.com", firm: "Northlake Health", country: "Canada", city: "Montreal", device: "Mobile", browser: "Chrome", os: "Android", intensity: 0.1, depth: 0.32, links: ["northlake-diligence"], verified: false, downloads: 0 },
  { email: "y.bergstrom@vantagerowe.com", firm: "Vantage Rowe", country: "Netherlands", city: "Amsterdam", device: "Desktop", browser: "Chrome", os: "macOS", intensity: 0.17, depth: 0.8, links: ["series-b-restricted", "annual-report", "financial-model"], verified: true, downloads: 0.3 },
  { email: "i.laurent@vantagerowe.com", firm: "Vantage Rowe", country: "France", city: "Paris", device: "Desktop", browser: "Safari", os: "macOS", intensity: 0.11, depth: 0.48, links: ["annual-report"], verified: true, downloads: 0.1 },
  { email: "o.mensah@pembertonclarke.com", firm: "Pemberton Clarke", country: "United Kingdom", city: "Bristol", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.12, depth: 0.55, links: ["msa-template", "deck"], verified: false, downloads: 0.1 },
  { email: "v.rosetti@torhalloran.com", firm: "Tor and Halloran", country: "Ireland", city: "Dublin", device: "Desktop", browser: "Chrome", os: "macOS", intensity: 0.13, depth: 0.6, links: ["series-b-restricted", "msa-template"], verified: true, downloads: 0.15 },
  { email: "m.ferreira@torhalloran.com", firm: "Tor and Halloran", country: "Portugal", city: "Lisbon", device: "Desktop", browser: "Firefox", os: "Linux", intensity: 0.07, depth: 0.3, links: ["msa-template"], verified: true, downloads: 0 },
  { email: "chair@larkfieldboard.com", firm: "Board", country: "United Kingdom", city: "Oxford", device: "Tablet", browser: "Safari", os: "iPadOS", intensity: 0.16, depth: 0.72, links: ["board-q2"], verified: true, downloads: 0.4 },
  { email: "n.dulwich@larkfieldboard.com", firm: "Board", country: "United Kingdom", city: "London", device: "Desktop", browser: "Chrome", os: "macOS", intensity: 0.14, depth: 0.65, links: ["board-q2"], verified: true, downloads: 0.3 },
  { email: "t.aaltonen@harbourlaneadvisors.com", firm: "Harbour Lane Advisors", country: "Finland", city: "Helsinki", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.1, depth: 0.5, links: ["deck", "security-overview"], verified: false, downloads: 0.1 },
  { email: "r.kaplan@grovewellpartners.com", firm: "Grovewell Partners", country: "United States", city: "Boston", device: "Desktop", browser: "Chrome", os: "macOS", intensity: 0.15, depth: 0.58, links: ["deck", "series-b-open"], verified: false, downloads: 0.1 },
  { email: "l.mccarthy@grovewellpartners.com", firm: "Grovewell Partners", country: "United States", city: "Chicago", device: "Desktop", browser: "Chrome", os: "Windows", intensity: 0.08, depth: 0.26, links: ["deck"], verified: false, downloads: 0 },
  { email: "d.forsyth@caldwellrowe.com", firm: "Caldwell Rowe", country: "United Kingdom", city: "Edinburgh", device: "Desktop", browser: "Edge", os: "Windows", intensity: 0.09, depth: 0.42, links: ["annual-report", "deck"], verified: false, downloads: 0 },
];

const ANON_GEO = [
  { country: "United Kingdom", city: "London" },
  { country: "United States", city: "San Francisco" },
  { country: "Germany", city: "Hamburg" },
  { country: "France", city: "Lyon" },
  { country: "Singapore", city: "Singapore" },
  { country: "Australia", city: "Melbourne" },
  { country: "Switzerland", city: "Zurich" },
  { country: "Denmark", city: "Copenhagen" },
] as const;

// ---------- main ----------

type DocRow = {
  key: string;
  id: string;
  versionId: string;
  numPages: number | null;
  keyPage: number | null;
  name: string;
};

type LinkTarget = {
  key: string;
  id: string;
  kind: "DOCUMENT" | "DATAROOM";
  dataroomId: string | null;
  documentId: string | null;
  /** Documents reachable through this link, weighted by position. */
  docs: DocRow[];
  fromDay: number;
  toDay: number;
};

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset) await resetDemo();

  // ---- users ----
  for (const m of MEMBERS) {
    await db.user.upsert({
      where: { email: m.email },
      update: { name: m.name },
      create: { id: sid(`user:${m.key}`), email: m.email, name: m.name },
    });
  }
  const users = new Map(
    (
      await db.user.findMany({ where: { email: { in: MEMBERS.map((m) => m.email) } } })
    ).map((u) => [u.email, u])
  );
  const userId = (key: string) => users.get(MEMBERS.find((m) => m.key === key)!.email)!.id;

  // ---- teams ----
  const teamId = sid("team:larkfield");
  const team2Id = sid("team:harbour");
  const team = await db.team.upsert({
    where: { slug: TEAM_SLUG },
    update: { name: "Larkfield Instruments" },
    create: { id: teamId, name: "Larkfield Instruments", slug: TEAM_SLUG },
  });
  const team2 = await db.team.upsert({
    where: { slug: TEAM2_SLUG },
    update: { name: "Harbour Lane Advisors" },
    create: { id: team2Id, name: "Harbour Lane Advisors", slug: TEAM2_SLUG },
  });
  const T = team.id;
  const T2 = team2.id;

  for (const m of MEMBERS) {
    await db.teamMember.upsert({
      where: { teamId_userId: { teamId: T, userId: userId(m.key) } },
      update: { role: m.role },
      create: {
        id: sid(`member:${m.key}`),
        teamId: T,
        userId: userId(m.key),
        role: m.role,
        createdAt: atDay(randInt(120, 300), 9, 30),
      },
    });
  }
  // The second team exists so the switcher has somewhere to go.
  for (const [key, role] of [
    ["avery", "OWNER"],
    ["priya", "ADMIN"],
  ] as const) {
    await db.teamMember.upsert({
      where: { teamId_userId: { teamId: T2, userId: userId(key) } },
      update: { role },
      create: {
        id: sid(`member2:${key}`),
        teamId: T2,
        userId: userId(key),
        role,
        createdAt: atDay(88, 11, 0),
      },
    });
  }

  // ---- pending invites (both states on the members page) ----
  const INVITES = [
    { email: "nina.abadi@larkfield.io", role: "ADMIN" as const, days: 4 },
    { email: "james.whitcombe@larkfield.io", role: "MEMBER" as const, days: 11 },
  ];
  for (const inv of INVITES) {
    await db.teamInvite.upsert({
      where: { teamId_email: { teamId: T, email: inv.email } },
      update: { role: inv.role, expiresAt: daysFromNow(14 - inv.days) },
      create: {
        id: sid(`invite:${inv.email}`),
        teamId: T,
        email: inv.email,
        role: inv.role,
        token: tok(`invite:${inv.email}`),
        invitedBy: userId("avery"),
        expiresAt: daysFromNow(14 - inv.days),
        createdAt: atDay(inv.days, 10, 15),
      },
    });
  }

  // ---- notification preferences ----
  const NOTIF_KEYS = [
    "document_viewed",
    "dataroom_visited",
    "file_uploaded",
    "new_question",
    "blocked_access",
  ];
  for (const m of MEMBERS) {
    for (const key of NOTIF_KEYS) {
      const on = !(m.role === "MEMBER" && key === "document_viewed");
      await db.notificationPreference.upsert({
        where: {
          userId_teamId_key: { userId: userId(m.key), teamId: T, key },
        },
        update: { email: on },
        create: {
          id: sid(`np:${m.key}:${key}`),
          userId: userId(m.key),
          teamId: T,
          key,
          email: on,
        },
      });
    }
  }

  // ---- brand assets + branding ----
  const logoKey = await put(`${T}/demo-brand/logo.png`, buildLogo(), "image/png");
  const bannerKey = await put(`${T}/demo-brand/banner.png`, buildBanner(), "image/png");
  const ogKey = await put(`${T}/demo-brand/social-card.png`, buildBanner(), "image/png");

  await db.branding.upsert({
    where: { id: sid("branding:team") },
    update: {},
    create: { id: sid("branding:team"), teamId: T },
  });
  await db.branding.update({
    where: { id: sid("branding:team") },
    data: {
      logoKey,
      bannerKey,
      brandColor: "#175B47",
      backgroundColor: "#101418",
      applyBgToDataroom: true,
      welcomeMessage:
        "Welcome. Everything here is confidential and shared for the purpose of your evaluation only. Start with the guide in section 01 if this is your first visit.",
      ctaLabel: "Talk to the deal team",
      ctaUrl: "https://larkfield.io/investors",
      metaTitle: "Larkfield Instruments - confidential materials",
      metaDescription:
        "Industrial sensing at plant scale. Materials shared under confidentiality.",
      metaImageKey: ogKey,
    },
  });
  await db.branding.upsert({
    where: { id: sid("branding:team2") },
    update: {},
    create: {
      id: sid("branding:team2"),
      teamId: T2,
      brandColor: "#1D4ED8",
      welcomeMessage: "Harbour Lane Advisors - client materials.",
    },
  });

  // ---- domains ----
  const domain = await db.domain.upsert({
    where: { domain: "share.larkfield.io" },
    update: { status: "VERIFIED", teamId: T, lastCheckedAt: hoursAgo(6) },
    create: {
      id: sid("domain:share"),
      teamId: T,
      domain: "share.larkfield.io",
      status: "VERIFIED",
      verificationToken: tok("domain:share"),
      cloudflareRecordId: "3f9a1c7b4e2d5a6f8b0c1d2e3f4a5b6c",
      cloudflareZoneId: "9d8c7b6a5e4f3a2b1c0d9e8f7a6b5c4d",
      lastCheckedAt: hoursAgo(6),
      createdAt: atDay(96, 14, 20),
    },
  });
  await db.domain.upsert({
    where: { domain: "docs.larkfieldinstruments.com" },
    update: { status: "PENDING", teamId: T },
    create: {
      id: sid("domain:docs"),
      teamId: T,
      domain: "docs.larkfieldinstruments.com",
      status: "PENDING",
      verificationToken: tok("domain:docs"),
      createdAt: atDay(3, 16, 40),
    },
  });

  // ---- presets ----
  const PRESETS = [
    {
      key: "investor",
      name: "Investor materials",
      isDefault: true,
      config: {
        accessMode: "EMAIL_VERIFIED",
        allowDownload: false,
        watermark: true,
        screenshotProtection: true,
        notifyOnAccess: true,
        enableIndexFile: true,
        enableQA: true,
        allowList: [],
        blockList: [],
        welcomeMessage:
          "Shared under the confidentiality undertaking already in place between us.",
      },
    },
    {
      key: "customer",
      name: "Customer diligence",
      isDefault: false,
      config: {
        accessMode: "EMAIL",
        allowDownload: true,
        watermark: false,
        screenshotProtection: false,
        notifyOnAccess: true,
        enableIndexFile: true,
        enableQA: false,
        allowList: [],
        blockList: [],
      },
    },
    {
      key: "public",
      name: "Public teaser",
      isDefault: false,
      config: {
        accessMode: "PUBLIC",
        allowDownload: true,
        watermark: false,
        screenshotProtection: false,
        notifyOnAccess: false,
        enableIndexFile: false,
        enableQA: false,
        allowList: [],
        blockList: [],
      },
    },
  ];
  for (const p of PRESETS) {
    await db.linkPreset.upsert({
      where: { id: sid(`preset:${p.key}`) },
      update: { name: p.name, isDefault: p.isDefault, config: p.config },
      create: {
        id: sid(`preset:${p.key}`),
        teamId: T,
        name: p.name,
        isDefault: p.isDefault,
        config: p.config,
        createdAt: atDay(70, 12, 0),
      },
    });
  }

  for (const pp of [
    {
      key: "default",
      name: "Larkfield default card",
      isDefault: true,
      metaTitle: "Larkfield Instruments",
      metaDescription:
        "Industrial sensing at plant scale. Confidential materials shared by the Larkfield team.",
    },
    {
      key: "series-b",
      name: "Series B card",
      isDefault: false,
      metaTitle: "Larkfield Instruments - Series B",
      metaDescription:
        "Financing materials for the Series B round. Shared under confidentiality.",
    },
  ]) {
    await db.previewPreset.upsert({
      where: { id: sid(`preview:${pp.key}`) },
      update: {
        name: pp.name,
        isDefault: pp.isDefault,
        metaTitle: pp.metaTitle,
        metaDescription: pp.metaDescription,
        metaImageKey: ogKey,
      },
      create: {
        id: sid(`preview:${pp.key}`),
        teamId: T,
        name: pp.name,
        isDefault: pp.isDefault,
        metaTitle: pp.metaTitle,
        metaDescription: pp.metaDescription,
        metaImageKey: ogKey,
        createdAt: atDay(68, 15, 30),
      },
    });
  }

  // ---- api tokens ----
  for (const t of [
    { key: "cli", name: "Deal team CLI", plain: API_KEY_PLAIN, lastUsed: hoursAgo(5) },
    { key: "ci", name: "Reporting job", plain: API_KEY_PLAIN_CI, lastUsed: atDay(9, 3, 15) },
  ]) {
    await db.apiToken.upsert({
      where: { id: sid(`token:${t.key}`) },
      update: { lastUsedAt: t.lastUsed },
      create: {
        id: sid(`token:${t.key}`),
        teamId: T,
        userId: userId("avery"),
        name: t.name,
        hashedKey: hashApiKey(t.plain),
        partialKey: `${t.plain.slice(0, 12)}…`,
        lastUsedAt: t.lastUsed,
        createdAt: atDay(62, 11, 5),
      },
    });
  }

  // ---- webhooks + delivery history ----
  const hooks = [
    {
      key: "crm",
      url: "https://hooks.larkfield.io/foyer/crm",
      events: ["document.viewed", "dataroom.visited", "link.created"],
      active: true,
    },
    {
      key: "slack",
      url: "https://hooks.larkfield.io/foyer/slack-deal-room",
      events: [],
      active: false,
    },
  ];
  for (const h of hooks) {
    await db.webhook.upsert({
      where: { id: sid(`hook:${h.key}`) },
      update: { url: h.url, events: h.events, active: h.active },
      create: {
        id: sid(`hook:${h.key}`),
        teamId: T,
        url: h.url,
        secret: tok(`hook:${h.key}`),
        events: h.events,
        active: h.active,
        createdAt: atDay(58, 9, 45),
      },
    });
  }
  await db.webhookDelivery.deleteMany({ where: { webhook: { teamId: T } } });

  // ---- folders ----
  for (const f of FOLDERS) {
    await db.folder.upsert({
      where: { id: sid(`folder:${f.key}`) },
      update: { name: f.name, parentId: f.parent ? sid(`folder:${f.parent}`) : null },
      create: {
        id: sid(`folder:${f.key}`),
        teamId: T,
        name: f.name,
        parentId: f.parent ? sid(`folder:${f.parent}`) : null,
        createdAt: atDay(randInt(100, 200), 10, 0),
      },
    });
  }

  // ---- documents, files and versions ----
  const docs = new Map<string, DocRow>();
  const pdfBytes = new Map<string, Uint8Array>();

  for (const spec of DOCS) {
    const docId = sid(`doc:${spec.key}`);
    const versions = [...(spec.extraVersions ?? []), { note: null, daysAgo: 0 }];
    let currentVersionId = "";
    let numPages: number | null = null;
    let contentType = "application/octet-stream";
    let type: "PDF" | "IMAGE" | "SHEET" | "TEXT" = "PDF";

    await db.document.upsert({
      where: { id: docId },
      update: { name: spec.name, folderId: spec.folder ? sid(`folder:${spec.folder}`) : null },
      create: {
        id: docId,
        teamId: T,
        name: spec.name,
        type: "PDF",
        folderId: spec.folder ? sid(`folder:${spec.folder}`) : null,
        createdAt: atDay(randInt(30, 180), randInt(9, 17), randInt(0, 59)),
      },
    });

    for (let vi = 0; vi < versions.length; vi++) {
      const v = versions[vi];
      const versionId = sid(`ver:${spec.key}:${vi + 1}`);
      const key = `${T}/demo-${spec.key}/v${vi + 1}/${spec.file}`;
      let body: Buffer;

      if (spec.kind === "pdf") {
        const bytes = await buildPdf({
          title: spec.name,
          subtitle: spec.subtitle ?? "Confidential",
          pages: spec.pages!,
          headings: spec.headings ?? ["Overview", "Detail", "Appendix"],
          theme: spec.theme ?? "corporate",
          keyPage: spec.keyPage,
          reference: spec.reference ?? "LI-2026",
        });
        body = Buffer.from(bytes);
        if (vi === versions.length - 1) pdfBytes.set(spec.key, bytes);
        numPages = spec.pages!;
        contentType = "application/pdf";
        type = "PDF";
      } else if (spec.kind === "png") {
        body = buildDiagram();
        contentType = "image/png";
        type = "IMAGE";
        numPages = 1;
      } else if (spec.kind === "csv") {
        body = Buffer.from(CSV_BODY, "utf8");
        contentType = "text/csv";
        type = "SHEET";
        numPages = null;
      } else if (spec.kind === "xlsx") {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([
            ["Function", "Now", "H1 FY26", "H2 FY26", "FY26 exit", "Notes"],
            ["Engineering", 24, 27, 31, 31, "Two firmware hires phased on booked pipeline"],
            ["Field engineering", 11, 14, 18, 18, "Paired with commercial on every rollout"],
            ["Commercial", 9, 12, 14, 14, "One partner manager in DACH"],
            ["Operations", 7, 8, 9, 9, "Includes calibration lab"],
            ["Finance and legal", 4, 5, 6, 6, "Second controller from Q3"],
            ["Total", 55, 66, 78, 78, ""],
          ]),
          "Headcount"
        );
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([
            ["Assumption", "Value"],
            ["Average fully loaded cost", 96000],
            ["Attrition", "9%"],
            ["Recruitment lead time (weeks)", 11],
          ]),
          "Assumptions"
        );
        body = Buffer.from(
          XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
        );
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        type = "SHEET";
        numPages = null;
      } else {
        body = Buffer.from(spec.kind === "md" ? MD_BODY : TXT_BODY, "utf8");
        contentType = spec.kind === "md" ? "text/markdown" : "text/plain";
        type = "TEXT";
        numPages = null;
      }

      await put(key, body, contentType);
      const createdAt = atDay(v.daysAgo || randInt(2, 28), randInt(9, 18), randInt(0, 59));
      await db.documentVersion.upsert({
        where: { id: versionId },
        update: { fileKey: key, fileSize: body.length, numPages, note: v.note ?? null },
        create: {
          id: versionId,
          documentId: docId,
          versionNumber: vi + 1,
          fileKey: key,
          fileName: spec.file,
          fileSize: body.length,
          contentType,
          numPages,
          uploadedById: userId(pick(["avery", "priya", "tom", "sasha"])),
          note: v.note ?? null,
          createdAt,
        },
      });
      currentVersionId = versionId;
    }

    await db.document.update({
      where: { id: docId },
      data: { type, currentVersionId },
    });
    docs.set(spec.key, {
      key: spec.key,
      id: docId,
      versionId: currentVersionId,
      numPages,
      keyPage: spec.keyPage ?? null,
      name: spec.name,
    });
  }

  const doc = (key: string) => docs.get(key)!;

  // ---- datarooms ----
  type RoomSpec = {
    key: string;
    name: string;
    description: string;
    createdDaysAgo: number;
    folders: { key: string; name: string; parent?: string }[];
    contents: { doc: string; folder?: string }[];
  };

  const ROOMS: RoomSpec[] = [
    {
      key: "series-b",
      name: "Series B - Larkfield Instruments",
      description:
        "Financing materials for the Series B round. Five sections; start with the guide in 01 Corporate.",
      createdDaysAgo: 74,
      folders: [
        { key: "sb-corp", name: "01 Corporate" },
        { key: "sb-fin", name: "02 Financials" },
        { key: "sb-fin-hist", name: "Historicals", parent: "sb-fin" },
        { key: "sb-fin-model", name: "Model and forecast", parent: "sb-fin" },
        { key: "sb-legal", name: "03 Legal" },
        { key: "sb-legal-con", name: "Material contracts", parent: "sb-legal" },
        { key: "sb-legal-ip", name: "Intellectual property", parent: "sb-legal" },
        { key: "sb-comm", name: "04 Commercial" },
        { key: "sb-prod", name: "05 Product and technology" },
      ],
      contents: [
        { doc: "room-guide", folder: "sb-corp" },
        { doc: "cap-table", folder: "sb-corp" },
        { doc: "esop", folder: "sb-corp" },
        { doc: "insurance", folder: "sb-corp" },
        { doc: "term-sheet", folder: "sb-corp" },
        { doc: "annual-report", folder: "sb-fin-hist" },
        { doc: "statutory", folder: "sb-fin-hist" },
        { doc: "revenue-csv", folder: "sb-fin-hist" },
        { doc: "model", folder: "sb-fin-model" },
        { doc: "unit-econ", folder: "sb-fin-model" },
        { doc: "headcount", folder: "sb-fin-model" },
        { doc: "msa", folder: "sb-legal-con" },
        { doc: "supply", folder: "sb-legal-con" },
        { doc: "dpa", folder: "sb-legal-con" },
        { doc: "patents", folder: "sb-legal-ip" },
        { doc: "refs", folder: "sb-comm" },
        { doc: "pipeline", folder: "sb-comm" },
        { doc: "roadmap", folder: "sb-prod" },
        { doc: "security", folder: "sb-prod" },
        { doc: "diagram", folder: "sb-prod" },
        { doc: "deck" },
      ],
    },
    {
      key: "meridian",
      name: "Project Meridian - Kesten Works",
      description:
        "Confirmatory diligence on the proposed acquisition of Kesten Works GmbH.",
      createdDaysAgo: 27,
      folders: [
        { key: "mer-corp", name: "Corporate" },
        { key: "mer-fin", name: "Financials" },
        { key: "mer-legal", name: "Legal" },
        { key: "mer-comm", name: "Commercial" },
      ],
      contents: [
        { doc: "dd-memo", folder: "mer-corp" },
        { doc: "integration-notes", folder: "mer-corp" },
        { doc: "statutory", folder: "mer-fin" },
        { doc: "unit-econ", folder: "mer-fin" },
        { doc: "supply", folder: "mer-legal" },
        { doc: "dpa", folder: "mer-legal" },
        { doc: "patents", folder: "mer-legal" },
        { doc: "pipeline", folder: "mer-comm" },
      ],
    },
    {
      key: "board",
      name: "Board pack - Q2 2026",
      description: "Papers for the June meeting of the board of directors.",
      createdDaysAgo: 34,
      folders: [],
      contents: [{ doc: "board-pack" }, { doc: "model" }, { doc: "pipeline" }],
    },
    {
      key: "northlake",
      name: "Customer diligence - Northlake Health",
      description: "Security and contractual pack for the Northlake procurement review.",
      createdDaysAgo: 19,
      folders: [],
      contents: [
        { doc: "security" },
        { doc: "dpa" },
        { doc: "msa" },
        { doc: "refs" },
      ],
    },
  ];

  const roomDocs = new Map<string, DocRow[]>();
  for (const room of ROOMS) {
    const roomId = sid(`room:${room.key}`);
    await db.dataroom.upsert({
      where: { id: roomId },
      update: { name: room.name, description: room.description },
      create: {
        id: roomId,
        teamId: T,
        name: room.name,
        description: room.description,
        createdAt: atDay(room.createdDaysAgo, 11, 20),
      },
    });
    for (let i = 0; i < room.folders.length; i++) {
      const f = room.folders[i];
      await db.dataroomFolder.upsert({
        where: { id: sid(`rf:${f.key}`) },
        update: {
          name: f.name,
          orderIndex: i,
          parentId: f.parent ? sid(`rf:${f.parent}`) : null,
        },
        create: {
          id: sid(`rf:${f.key}`),
          dataroomId: roomId,
          name: f.name,
          orderIndex: i,
          parentId: f.parent ? sid(`rf:${f.parent}`) : null,
          createdAt: atDay(room.createdDaysAgo, 11, 30 + i),
        },
      });
    }
    const list: DocRow[] = [];
    for (let i = 0; i < room.contents.length; i++) {
      const c = room.contents[i];
      await db.dataroomDocument.upsert({
        where: {
          dataroomId_documentId: { dataroomId: roomId, documentId: doc(c.doc).id },
        },
        update: {
          orderIndex: i,
          folderId: c.folder ? sid(`rf:${c.folder}`) : null,
        },
        create: {
          id: sid(`rd:${room.key}:${c.doc}`),
          dataroomId: roomId,
          documentId: doc(c.doc).id,
          folderId: c.folder ? sid(`rf:${c.folder}`) : null,
          orderIndex: i,
          createdAt: atDay(room.createdDaysAgo - 1 > 0 ? room.createdDaysAgo - 1 : 1, 12, i),
        },
      });
      list.push(doc(c.doc));
    }
    roomDocs.set(room.key, list);
  }

  // Per-room branding override on the showcase room.
  await db.branding.upsert({
    where: { id: sid("branding:room:series-b") },
    update: {},
    create: {
      id: sid("branding:room:series-b"),
      teamId: T,
      dataroomId: sid("room:series-b"),
      logoKey,
      bannerKey,
      brandColor: "#175B47",
      backgroundColor: "#0E1512",
      applyBgToDataroom: true,
      welcomeMessage:
        "Series B materials for Larkfield Instruments. Please do not forward this link; ask us and we will issue one for your colleague so the audit trail stays accurate.",
      ctaLabel: "Ask the deal team",
      ctaUrl: "mailto:ir@larkfield.io",
    },
  });

  // ---- granular member permissions ----
  const permTargets = [
    { member: "sasha", room: "series-b", level: "EDIT" as const },
    { member: "daniel", room: "series-b", level: "VIEW" as const },
    { member: "ines", room: "meridian", level: "MANAGE" as const },
    { member: "daniel", room: "northlake", level: "EDIT" as const },
  ];
  for (const p of permTargets) {
    await db.resourcePermission.upsert({
      where: {
        memberId_resourceType_resourceId: {
          memberId: sid(`member:${p.member}`),
          resourceType: "DATAROOM",
          resourceId: sid(`room:${p.room}`),
        },
      },
      update: { level: p.level },
      create: {
        id: sid(`perm:${p.member}:${p.room}`),
        memberId: sid(`member:${p.member}`),
        resourceType: "DATAROOM",
        resourceId: sid(`room:${p.room}`),
        level: p.level,
      },
    });
  }

  // ---- agreements ----
  const ndaKey = `${T}/demo-agreement/mutual-nda.pdf`;
  await put(ndaKey, Buffer.from(pdfBytes.get("nda")!), "application/pdf");
  await db.agreement.upsert({
    where: { id: sid("agr:nda") },
    update: {},
    create: {
      id: sid("agr:nda"),
      teamId: T,
      name: "Mutual non-disclosure agreement",
      requireName: true,
      type: "EMBEDDED",
      fileKey: ndaKey,
      numPages: 3,
      fields: [
        { kind: "name", page: 3, xPct: 0.12, yPct: 0.66, wPct: 0.3, hPct: 0.03 },
        { kind: "signature", page: 3, xPct: 0.12, yPct: 0.72, wPct: 0.26, hPct: 0.06 },
        { kind: "date", page: 3, xPct: 0.6, yPct: 0.72, wPct: 0.18, hPct: 0.03 },
      ],
      createdAt: atDay(80, 10, 30),
    },
  });
  await db.agreement.upsert({
    where: { id: sid("agr:terms") },
    update: {},
    create: {
      id: sid("agr:terms"),
      teamId: T,
      name: "Data room terms of access",
      requireName: true,
      type: "TEXT",
      content:
        "By entering this data room you confirm that you are acting for the party named in your invitation, that you will treat everything you see as confidential, that you will not forward, copy or reproduce any part of it, and that you will return or destroy any copies on request. Access is logged, including the pages you read and the time spent on each.",
      createdAt: atDay(52, 14, 10),
    },
  });

  // ---- links ----
  type LinkSpec = {
    key: string;
    name: string;
    slug: string;
    target: "DOCUMENT" | "DATAROOM";
    doc?: string;
    room?: string;
    accessMode: "PUBLIC" | "EMAIL" | "EMAIL_VERIFIED";
    password?: string;
    expiresInDays?: number;
    expiredDaysAgo?: number;
    allowDownload?: boolean;
    allowList?: string[];
    blockList?: string[];
    watermark?: boolean;
    screenshot?: boolean;
    agreement?: string;
    archived?: boolean;
    fullAccess?: boolean;
    grants?: { itemType: "DATAROOM_FOLDER" | "DATAROOM_DOCUMENT"; itemId: string; canDownload?: boolean }[];
    onDomain?: boolean;
    qa?: boolean;
    index?: boolean;
    welcome?: string;
    previewPreset?: string;
    createdDaysAgo: number;
    fromDay: number;
    toDay: number;
    recipients?: { email: string; opened: boolean; daysAgo: number }[];
  };

  const LINKS: LinkSpec[] = [
    {
      key: "series-b-lead",
      name: "Series B - Brightwater (lead)",
      slug: "series-b-brightwater",
      target: "DATAROOM",
      room: "series-b",
      accessMode: "EMAIL_VERIFIED",
      watermark: true,
      allowDownload: true,
      onDomain: true,
      qa: true,
      index: true,
      welcome:
        "Brightwater team - everything discussed on the call is in section 02. Ask questions in the room and we will answer in order.",
      previewPreset: "series-b",
      createdDaysAgo: 72,
      fromDay: 70,
      toDay: 0,
      recipients: [
        { email: "m.calloway@brightwatercapital.com", opened: true, daysAgo: 70 },
        { email: "j.pereira@brightwatercapital.com", opened: true, daysAgo: 70 },
        { email: "h.osei@brightwatercapital.com", opened: true, daysAgo: 41 },
        { email: "a.whitmore@brightwatercapital.com", opened: false, daysAgo: 2 },
      ],
    },
    {
      key: "series-b-open",
      name: "Series B - process (email gate)",
      slug: "series-b-process",
      target: "DATAROOM",
      room: "series-b",
      accessMode: "EMAIL",
      allowDownload: false,
      index: true,
      createdDaysAgo: 61,
      fromDay: 58,
      toDay: 0,
    },
    {
      key: "series-b-restricted",
      name: "Series B - legal counsel (scoped)",
      slug: "series-b-counsel",
      target: "DATAROOM",
      room: "series-b",
      accessMode: "EMAIL",
      fullAccess: false,
      allowDownload: true,
      index: true,
      grants: [
        { itemType: "DATAROOM_FOLDER", itemId: sid("rf:sb-legal"), canDownload: true },
        { itemType: "DATAROOM_FOLDER", itemId: sid("rf:sb-legal-con"), canDownload: true },
        { itemType: "DATAROOM_FOLDER", itemId: sid("rf:sb-legal-ip"), canDownload: true },
        { itemType: "DATAROOM_FOLDER", itemId: sid("rf:sb-corp") },
        { itemType: "DATAROOM_DOCUMENT", itemId: sid("rd:series-b:msa"), canDownload: true },
      ],
      createdDaysAgo: 44,
      fromDay: 42,
      toDay: 0,
    },
    {
      key: "series-b-nda",
      name: "Series B - Meridian (NDA gate)",
      slug: "series-b-meridian",
      target: "DATAROOM",
      room: "series-b",
      accessMode: "EMAIL_VERIFIED",
      agreement: "agr:nda",
      watermark: true,
      allowDownload: false,
      index: true,
      qa: true,
      createdDaysAgo: 49,
      fromDay: 47,
      toDay: 0,
    },
    {
      key: "meridian-diligence",
      name: "Project Meridian - buy-side advisers",
      slug: "meridian-diligence",
      target: "DATAROOM",
      room: "meridian",
      accessMode: "EMAIL_VERIFIED",
      password: LINK_PASSWORD,
      watermark: true,
      screenshot: true,
      allowDownload: false,
      index: true,
      qa: true,
      createdDaysAgo: 26,
      fromDay: 25,
      toDay: 0,
      recipients: [
        { email: "d.aziz@kestrelbridge.com", opened: true, daysAgo: 25 },
        { email: "c.hallberg@kestrelbridge.com", opened: true, daysAgo: 25 },
        { email: "k.reinhardt@kestenworks.de", opened: true, daysAgo: 24 },
        { email: "b.ostrowski@kestrelbridge.com", opened: false, daysAgo: 1 },
      ],
    },
    {
      key: "board-q2",
      name: "Board pack Q2 - directors",
      slug: "board-q2-2026",
      target: "DATAROOM",
      room: "board",
      accessMode: "EMAIL_VERIFIED",
      allowList: ["larkfieldboard.com", "brightwatercapital.com"],
      onDomain: true,
      index: true,
      createdDaysAgo: 33,
      fromDay: 32,
      toDay: 0,
    },
    {
      key: "northlake-diligence",
      name: "Northlake Health - procurement",
      slug: "northlake-procurement",
      target: "DATAROOM",
      room: "northlake",
      accessMode: "EMAIL",
      blockList: ["gmail.com", "competitor-sensing.com"],
      index: true,
      createdDaysAgo: 18,
      fromDay: 17,
      toDay: 0,
    },
    {
      key: "deck",
      name: "Investor deck - general",
      slug: "larkfield-deck",
      target: "DOCUMENT",
      doc: "deck",
      accessMode: "PUBLIC",
      createdDaysAgo: 76,
      fromDay: 60,
      toDay: 0,
      previewPreset: "default",
    },
    {
      key: "deck-teaser",
      name: "Deck teaser - closing this week",
      slug: "larkfield-teaser",
      target: "DOCUMENT",
      doc: "deck",
      accessMode: "PUBLIC",
      expiresInDays: 3,
      createdDaysAgo: 9,
      fromDay: 9,
      toDay: 0,
    },
    {
      key: "deck-q1",
      name: "Deck - Q1 circulation (expired)",
      slug: "larkfield-deck-q1",
      target: "DOCUMENT",
      doc: "deck",
      accessMode: "EMAIL",
      expiredDaysAgo: 12,
      createdDaysAgo: 58,
      fromDay: 58,
      toDay: 13,
    },
    {
      key: "financial-model",
      name: "Financial model - investors only",
      slug: "financial-model",
      target: "DOCUMENT",
      doc: "model",
      accessMode: "EMAIL_VERIFIED",
      allowDownload: false,
      watermark: true,
      screenshot: true,
      createdDaysAgo: 47,
      fromDay: 45,
      toDay: 0,
    },
    {
      key: "msa-template",
      name: "MSA template - counterparties",
      slug: "msa-template",
      target: "DOCUMENT",
      doc: "msa",
      accessMode: "EMAIL",
      createdDaysAgo: 39,
      fromDay: 38,
      toDay: 0,
    },
    {
      key: "cap-table",
      name: "Cap table - named recipients",
      slug: "cap-table",
      target: "DOCUMENT",
      doc: "cap-table",
      accessMode: "EMAIL_VERIFIED",
      allowList: ["m.calloway@brightwatercapital.com", "d.aziz@kestrelbridge.com"],
      allowDownload: false,
      createdDaysAgo: 30,
      fromDay: 29,
      toDay: 0,
    },
    {
      key: "roadmap-archived",
      name: "Roadmap - superseded",
      slug: "roadmap-2025",
      target: "DOCUMENT",
      doc: "roadmap",
      accessMode: "PUBLIC",
      archived: true,
      createdDaysAgo: 65,
      fromDay: 65,
      toDay: 24,
    },
    {
      key: "security-overview",
      name: "Security overview - public",
      slug: "security-overview",
      target: "DOCUMENT",
      doc: "security",
      accessMode: "PUBLIC",
      createdDaysAgo: 54,
      fromDay: 52,
      toDay: 0,
    },
    {
      key: "annual-report",
      name: "Annual report 2025",
      slug: "annual-report-2025",
      target: "DOCUMENT",
      doc: "annual-report",
      accessMode: "PUBLIC",
      createdDaysAgo: 50,
      fromDay: 48,
      toDay: 0,
    },
  ];

  const targets = new Map<string, LinkTarget>();
  for (const l of LINKS) {
    const linkId = sid(`link:${l.key}`);
    const expiresAt = l.expiresInDays
      ? daysFromNow(l.expiresInDays)
      : l.expiredDaysAgo
        ? atDay(l.expiredDaysAgo, 23, 59)
        : null;
    const data = {
      teamId: T,
      target: l.target,
      documentId: l.doc ? doc(l.doc).id : null,
      dataroomId: l.room ? sid(`room:${l.room}`) : null,
      name: l.name,
      slug: l.slug,
      domainId: l.onDomain ? domain.id : null,
      accessMode: l.accessMode,
      passwordHash: l.password ? hashPassword(l.password) : null,
      expiresAt,
      allowDownload: l.allowDownload ?? true,
      allowList: l.allowList ?? [],
      blockList: l.blockList ?? [],
      screenshotProtection: l.screenshot ?? false,
      watermark: l.watermark ?? false,
      agreementId: l.agreement ? sid(l.agreement) : null,
      notifyOnAccess: l.accessMode !== "PUBLIC",
      enableIndexFile: l.index ?? false,
      enableQA: l.qa ?? false,
      fullAccess: l.fullAccess ?? true,
      welcomeMessage: l.welcome ?? null,
      previewPresetId: l.previewPreset ? sid(`preview:${l.previewPreset}`) : null,
      isArchived: l.archived ?? false,
    };
    await db.link.upsert({
      where: { id: linkId },
      update: data,
      create: { id: linkId, ...data, createdAt: atDay(l.createdDaysAgo, 12, 30) },
    });

    await db.linkPermission.deleteMany({ where: { linkId } });
    for (const g of l.grants ?? []) {
      await db.linkPermission.create({
        data: {
          id: sid(`lp:${l.key}:${g.itemId}`),
          linkId,
          itemType: g.itemType,
          itemId: g.itemId,
          canView: true,
          canDownload: g.canDownload ?? false,
        },
      });
    }
    for (const r of l.recipients ?? []) {
      await db.linkRecipient.upsert({
        where: { linkId_email: { linkId, email: r.email } },
        update: { lastSentAt: atDay(r.daysAgo, 9, 15) },
        create: {
          id: sid(`lr:${l.key}:${r.email}`),
          linkId,
          email: r.email,
          token: tok(`lr:${l.key}:${r.email}`),
          expiresAt: daysFromNow(30 - r.daysAgo > 0 ? 30 - r.daysAgo : 5),
          invitedAt: atDay(r.daysAgo, 9, 15),
          lastSentAt: atDay(r.daysAgo, 9, 15),
        },
      });
    }

    const list = l.room
      ? roomDocs.get(l.room)!.filter((d) => {
          if (l.fullAccess !== false) return true;
          // Scoped link: only the granted legal/corporate documents are visible.
          const allowed = ["msa", "supply", "dpa", "patents", "cap-table", "esop", "room-guide"];
          return allowed.includes(d.key);
        })
      : [doc(l.doc!)];
    targets.set(l.key, {
      key: l.key,
      id: linkId,
      kind: l.target,
      dataroomId: l.room ? sid(`room:${l.room}`) : null,
      documentId: l.doc ? doc(l.doc).id : null,
      docs: list,
      fromDay: l.fromDay,
      toDay: l.toDay,
    });
  }

  // ---- viewers ----
  for (const p of PERSONAS) {
    await db.viewer.upsert({
      where: { teamId_email: { teamId: T, email: p.email } },
      update: { verified: p.verified },
      create: {
        id: sid(`viewer:${p.email}`),
        teamId: T,
        email: p.email,
        verified: p.verified,
        createdAt: atDay(randInt(20, 70), randInt(8, 18), randInt(0, 59)),
      },
    });
  }
  const viewerIds = new Map(
    (await db.viewer.findMany({ where: { teamId: T } })).map((v) => [v.email, v.id])
  );

  // ---- views, page views, mouse batches ----
  await db.view.deleteMany({ where: { link: { teamId: { in: [T, T2] } } } });

  const views: Prisma.ViewCreateManyInput[] = [];
  const pageViews: Prisma.PageViewCreateManyInput[] = [];
  const mouse: Prisma.MouseBatchCreateManyInput[] = [];
  const ndaResponses: Prisma.AgreementResponseCreateManyInput[] = [];
  let viewSeq = 0;
  const sig1 = dataUrl(signaturePng(101));
  const sig2 = dataUrl(signaturePng(202));

  /** One document read, with a dwell profile that tells a story. */
  function documentView(
    link: LinkTarget,
    d: DocRow,
    start: Date,
    persona: Persona | null,
    depth: number
  ) {
    const viewId = sid(`view:${viewSeq++}`);
    const pages = d.numPages ?? 1;
    const bounce = chance(0.16) || depth < 0.16;
    const trail: { p: number; t: number; d: number }[] = [];
    const dwell = new Map<number, number>();
    let elapsed = 0;

    const addPage = (page: number, seconds: number) => {
      trail.push({ p: page, t: elapsed * 1000, d: seconds * 1000 });
      elapsed += seconds;
      dwell.set(page, (dwell.get(page) ?? 0) + seconds);
    };

    if (bounce) {
      addPage(1, gauss(18, 8, 5, 45));
      if (chance(0.4) && pages > 1) addPage(2, gauss(11, 6, 4, 30));
    } else {
      const reach = Math.max(
        1,
        Math.min(pages, Math.round(pages * (0.3 + depth * 0.78)))
      );
      for (let p = 1; p <= reach; p++) {
        // Attention front-loads, then tails off.
        const decay = Math.exp(-((p - 1) / Math.max(reach, 2)) * 1.25);
        let seconds = gauss(14 + 48 * decay, 9, 4, 190);
        if (d.keyPage && p === d.keyPage) seconds = Math.round(seconds * 2.7) + 25;
        if (p === 1) seconds = gauss(30, 10, 10, 70);
        addPage(p, seconds);
      }
      // The doubling-back that real readers do on the page that matters.
      if (d.keyPage && d.keyPage <= reach && chance(0.45))
        addPage(d.keyPage, gauss(42, 18, 12, 130));
      if (chance(0.24) && pages > reach) addPage(pages, gauss(34, 16, 8, 90));
      if (chance(0.3)) addPage(1, gauss(12, 6, 4, 35));
    }

    const maxPage = Math.max(...trail.map((s) => s.p));
    const total = Math.max(5, elapsed + randInt(0, 12));
    const begin = fitBefore(start, total);
    const downloaded =
      persona && chance(persona.downloads) && !bounce
        ? new Date(begin.getTime() + total * 900)
        : null;

    views.push({
      id: viewId,
      linkId: link.id,
      viewerId: persona ? viewerIds.get(persona.email)! : null,
      viewerEmail: persona?.email ?? null,
      documentId: d.id,
      dataroomId: link.dataroomId,
      verified: persona?.verified ?? false,
      agreementDone: link.key === "series-b-nda",
      startedAt: begin,
      lastActiveAt: new Date(begin.getTime() + total * 1000),
      totalDuration: total,
      completedPct: Math.min(100, Math.round((maxPage / pages) * 100)),
      pageTrail: trail,
      downloadedAt: downloaded,
      ip: persona
        ? `${randInt(20, 210)}.${randInt(1, 250)}.${randInt(1, 250)}.${randInt(2, 250)}`
        : `${randInt(20, 210)}.${randInt(1, 250)}.${randInt(1, 250)}.${randInt(2, 250)}`,
      country: persona?.country ?? pick(ANON_GEO).country,
      city: persona?.city ?? pick(ANON_GEO).city,
      browser: persona?.browser ?? pick(["Chrome", "Safari", "Firefox", "Edge"]),
      os: persona?.os ?? pick(["macOS", "Windows", "iOS", "Android"]),
      device: persona?.device ?? pick(["Desktop", "Desktop", "Mobile"]),
    });

    for (const [page, seconds] of dwell) {
      pageViews.push({
        id: sid(`pv:${viewId}:${page}`),
        viewId,
        versionId: d.versionId,
        pageNumber: page,
        duration: seconds,
      });
    }

    // Heatmaps only where there is enough dwell to be worth reading.
    if (total > 200 && d.numPages) {
      const hot = [...dwell.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([p]) => p);
      for (const page of hot) {
        const n = randInt(55, 130);
        const samples: number[][] = [];
        // A reading path down the text column, with a cluster on the figure.
        let y = 12 + rng() * 10;
        let x = 20 + rng() * 20;
        for (let i = 0; i < n; i++) {
          const focus = d.keyPage === page && i > n * 0.55;
          if (focus) {
            x = 46 + (rng() - 0.5) * 26;
            y = 44 + (rng() - 0.5) * 18;
          } else {
            y = Math.min(94, y + rng() * 1.9);
            x = Math.max(8, Math.min(92, x + (rng() - 0.5) * 16));
          }
          samples.push([
            Math.round(i * (dwell.get(page)! * 1000) / n),
            Math.round(x * 10) / 10,
            Math.round(y * 10) / 10,
          ]);
        }
        mouse.push({
          id: sid(`mb:${viewId}:${page}`),
          viewId,
          pageNumber: page,
          samples,
          createdAt: new Date(begin.getTime() + 30_000),
        });
      }
    }

    if (link.key === "series-b-nda" && persona) {
      ndaResponses.push({
        id: sid(`ar:${viewId}`),
        agreementId: sid("agr:nda"),
        viewId,
        name: persona.email
          .split("@")[0]
          .split(".")
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(" "),
        email: persona.email,
        signatureData: chance(0.5) ? sig1 : sig2,
        ip: `${randInt(20, 210)}.${randInt(1, 250)}.${randInt(1, 250)}.${randInt(2, 250)}`,
        signedAt: begin,
      });
    }
    return { viewId, total, begin };
  }

  /** A visit: data rooms get an index view then a few documents. */
  function session(link: LinkTarget, persona: Persona | null, start: Date, depth: number) {
    if (link.kind === "DATAROOM") {
      const viewId = sid(`view:${viewSeq++}`);
      const total = gauss(70, 40, 12, 260);
      // Room visits open a few files, so leave room for those before now.
      const begin = fitBefore(start, total + 900);
      views.push({
        id: viewId,
        linkId: link.id,
        viewerId: persona ? viewerIds.get(persona.email)! : null,
        viewerEmail: persona?.email ?? null,
        documentId: null,
        dataroomId: link.dataroomId,
        verified: persona?.verified ?? false,
        agreementDone: link.key === "series-b-nda",
        startedAt: begin,
        lastActiveAt: new Date(begin.getTime() + total * 1000),
        totalDuration: total,
        completedPct: 0,
        downloadedAt: null,
        ip: `${randInt(20, 210)}.${randInt(1, 250)}.${randInt(1, 250)}.${randInt(2, 250)}`,
        country: persona?.country ?? pick(ANON_GEO).country,
        city: persona?.city ?? pick(ANON_GEO).city,
        browser: persona?.browser ?? pick(["Chrome", "Safari", "Firefox"]),
        os: persona?.os ?? pick(["macOS", "Windows"]),
        device: persona?.device ?? "Desktop",
      });
      const opened = Math.max(1, Math.round(1 + depth * 3.2));
      let cursor = begin.getTime() + total * 1000;
      for (let i = 0; i < opened; i++) {
        // Early items in the room are opened more often, like a real index.
        const idx = Math.min(
          link.docs.length - 1,
          Math.floor(Math.pow(rng(), 1.7) * link.docs.length)
        );
        const d = link.docs[idx];
        const read = documentView(link, d, new Date(cursor), persona, depth);
        cursor = read.begin.getTime() + read.total * 1000 + randInt(4, 40) * 1000;
      }
    } else {
      documentView(link, link.docs[0], start, persona, depth);
    }
  }

  const activeOn = (t: LinkTarget, day: number) => day <= t.fromDay && day >= t.toDay;

  for (let day = 59; day >= 0; day--) {
    const dow = new Date(NOW - day * DAY).getDay();
    const weekend = dow === 0 || dow === 6;
    // The round heats up: recent days carry more traffic than old ones.
    const shape = (weekend ? 0.26 : 1) * (0.5 + 0.85 * (1 - day / 59));
    for (const p of PERSONAS) {
      const candidates = p.links
        .map((k) => targets.get(k))
        .filter((t): t is LinkTarget => !!t && activeOn(t, day));
      if (candidates.length === 0) continue;
      if (!chance(p.intensity * shape)) continue;
      const t = pick(candidates);
      // Working hours, with a lunchtime dip baked into the pick.
      const hour = pick([8, 9, 9, 10, 10, 11, 11, 14, 14, 15, 16, 16, 17, 18, 20]);
      session(t, p, atDay(day, hour, randInt(0, 59), randInt(0, 59)), p.depth);
    }
    // Anonymous traffic on the public links.
    const publicKeys = ["deck", "security-overview", "annual-report", "deck-teaser"];
    const anonCount = weekend ? randInt(0, 2) : randInt(1, 4);
    for (let i = 0; i < anonCount; i++) {
      const t = targets.get(pick(publicKeys))!;
      if (!activeOn(t, day)) continue;
      session(t, null, atDay(day, randInt(7, 22), randInt(0, 59), randInt(0, 59)), rng() * 0.5);
    }
  }

  // Fresh activity so relative times and "latest visits" look alive.
  const freshest: [string, string, number][] = [
    ["m.calloway@brightwatercapital.com", "series-b-lead", 0.6],
    ["d.aziz@kestrelbridge.com", "meridian-diligence", 1.9],
    ["t.nakamura@meridiangrowth.vc", "series-b-nda", 3.4],
    ["n.fairweather@hollowayfield.com", "series-b-restricted", 5.2],
    ["y.bergstrom@vantagerowe.com", "financial-model", 7.5],
  ];
  for (const [email, linkKey, hours] of freshest) {
    const p = PERSONAS.find((x) => x.email === email)!;
    session(targets.get(linkKey)!, p, hoursAgo(hours), p.depth);
  }

  await db.view.createMany({ data: views });
  await db.pageView.createMany({ data: pageViews });
  await db.mouseBatch.createMany({ data: mouse });
  if (ndaResponses.length) await db.agreementResponse.createMany({ data: ndaResponses });

  // ---- access requests (surfaced on the dashboard) ----
  await db.accessRequest.deleteMany({ where: { teamId: T } });
  await db.accessRequest.createMany({
    data: [
      {
        id: sid("req:1"),
        teamId: T,
        linkId: sid("link:series-b-open"),
        email: "r.delacroix@havenridgecapital.com",
        note: "We met at the industrials showcase in May. Would like to look at the financials before our Monday partner meeting.",
        status: "PENDING",
        createdAt: hoursAgo(4.5),
      },
      {
        id: sid("req:2"),
        teamId: T,
        linkId: sid("link:cap-table"),
        email: "j.pereira@brightwatercapital.com",
        note: "Cap table link is not letting me in - I think only Miriam is on the allow list.",
        status: "PENDING",
        createdAt: hoursAgo(21),
      },
      {
        id: sid("req:3"),
        teamId: T,
        linkId: sid("link:deck-q1"),
        email: "s.ackroyd@thornfieldlp.com",
        note: "The link I was forwarded has expired. Could you reissue it to me directly?",
        status: "PENDING",
        createdAt: atDay(2, 16, 40),
      },
      {
        id: sid("req:4"),
        teamId: T,
        linkId: sid("link:series-b-open"),
        email: "p.varga@stillwaterpartners.eu",
        note: null,
        status: "DISMISSED",
        createdAt: atDay(6, 11, 10),
      },
    ],
  });

  // ---- data room Q&A ----
  await db.dataroomQuestion.deleteMany({ where: { dataroom: { teamId: T } } });
  await db.dataroomQuestion.createMany({
    data: [
      {
        id: sid("q:1"),
        dataroomId: sid("room:series-b"),
        viewerEmail: "m.calloway@brightwatercapital.com",
        body: "Does the FY2026 revenue build assume any price increase on the installed base?",
        answer:
          "No. The base case holds list pricing flat across the forecast period; all growth is volume and new sites. Section 02 of the model summary sets out the sensitivity if we did move pricing.",
        answeredBy: "Priya Raman",
        answeredAt: atDay(11, 15, 20),
        createdAt: atDay(12, 9, 40),
      },
      {
        id: sid("q:2"),
        dataroomId: sid("room:series-b"),
        viewerEmail: "n.fairweather@hollowayfield.com",
        body: "Are there any change-of-control provisions in the Kesten Works supply agreement?",
        answer:
          "Clause 21.3 gives either party a termination right on a change of control of the other. Kesten have confirmed in writing that they will not exercise it in connection with this round.",
        answeredBy: "Tom Eriksen",
        answeredAt: atDay(8, 10, 5),
        createdAt: atDay(9, 17, 55),
      },
      {
        id: sid("q:3"),
        dataroomId: sid("room:series-b"),
        viewerEmail: "t.nakamura@meridiangrowth.vc",
        body: "How much of the ARR figure is hardware sold outright rather than subscription?",
        answer:
          "None. Hardware sold outright is reported separately and excluded from ARR; the reconciliation is on page four of the financial model summary.",
        answeredBy: "Priya Raman",
        answeredAt: atDay(5, 12, 30),
        createdAt: atDay(6, 8, 15),
      },
      {
        id: sid("q:4"),
        dataroomId: sid("room:series-b"),
        viewerEmail: "s.whitfield@northaxis.com",
        body: "Can you share the churn detail behind the two pilot accounts mentioned in the retention note?",
        answer: null,
        answeredBy: null,
        answeredAt: null,
        createdAt: hoursAgo(9),
      },
      {
        id: sid("q:5"),
        dataroomId: sid("room:meridian"),
        viewerEmail: "d.aziz@kestrelbridge.com",
        body: "Is the Munich lease assignable, or does it need landlord consent on a share purchase?",
        answer: null,
        answeredBy: null,
        answeredAt: null,
        createdAt: hoursAgo(30),
      },
      {
        id: sid("q:6"),
        dataroomId: sid("room:northlake"),
        viewerEmail: "f.mbeki@northlakehealth.com",
        body: "Which sub-processors handle data outside Canada, and is there a residency option?",
        answer:
          "Two: object storage in eu-west-1 and error reporting in us-east-1. A Canadian residency deployment is available and is described in the security overview, section five.",
        answeredBy: "Ines Moreau",
        answeredAt: atDay(3, 14, 45),
        createdAt: atDay(4, 9, 5),
      },
    ],
  });

  // ---- signature requests ----
  await db.signatureRequest.deleteMany({ where: { teamId: T } });

  type EnvelopeSigner = {
    key: string;
    email: string;
    name: string;
    role?: "SIGNER" | "CC";
    order?: number;
    status: "PENDING" | "SENT" | "VIEWED" | "SIGNED" | "DECLINED";
    signedDaysAgo?: number;
    viewedDaysAgo?: number;
    declinedDaysAgo?: number;
    declineReason?: string;
  };
  type Envelope = {
    key: string;
    doc: string;
    title: string;
    message: string;
    status: "DRAFT" | "SENT" | "COMPLETED" | "DECLINED" | "EXPIRED";
    sequential?: boolean;
    createdDaysAgo: number;
    sentDaysAgo?: number;
    completedDaysAgo?: number;
    expiresInDays?: number;
    expiredDaysAgo?: number;
    signers: EnvelopeSigner[];
  };

  const ENVELOPES: Envelope[] = [
    {
      key: "draft-msa",
      doc: "msa",
      title: "Master services agreement - Northlake Health",
      message:
        "Draft for internal review before it goes to Northlake. Fields are placed on the execution page.",
      status: "DRAFT",
      createdDaysAgo: 2,
      signers: [
        { key: "a", email: "f.mbeki@northlakehealth.com", name: "Folake Mbeki", status: "PENDING" },
        { key: "b", email: "tom.eriksen@larkfield.io", name: "Tom Eriksen", status: "PENDING" },
      ],
    },
    {
      key: "sent-nda",
      doc: "nda",
      title: "Mutual NDA - Meridian Growth Partners",
      message:
        "Standard mutual form. Once this is back with us we will open the full financial section.",
      status: "SENT",
      createdDaysAgo: 6,
      sentDaysAgo: 6,
      expiresInDays: 9,
      signers: [
        { key: "a", email: "t.nakamura@meridiangrowth.vc", name: "Taro Nakamura", status: "VIEWED", viewedDaysAgo: 1 },
        { key: "b", email: "tom.eriksen@larkfield.io", name: "Tom Eriksen", status: "SENT" },
        { key: "c", email: "priya.raman@larkfield.io", name: "Priya Raman", role: "CC", status: "SENT" },
      ],
    },
    {
      key: "serial-supply",
      doc: "supply",
      title: "Supply agreement amendment - Kesten Works",
      message:
        "Amendment three, signing in order: Kesten first, then our head of legal, then the chief executive.",
      status: "SENT",
      sequential: true,
      createdDaysAgo: 13,
      sentDaysAgo: 13,
      expiresInDays: 17,
      signers: [
        { key: "a", email: "k.reinhardt@kestenworks.de", name: "Katrin Reinhardt", order: 0, status: "SIGNED", signedDaysAgo: 9, viewedDaysAgo: 12 },
        { key: "b", email: "tom.eriksen@larkfield.io", name: "Tom Eriksen", order: 1, status: "VIEWED", viewedDaysAgo: 2 },
        { key: "c", email: "demo@larkfield.io", name: "Avery Holt", order: 2, status: "PENDING" },
      ],
    },
    {
      key: "completed-term-sheet",
      doc: "term-sheet",
      title: "Series B term sheet - Brightwater Capital",
      message: "Non-binding heads of terms as discussed. Countersignature appreciated.",
      status: "COMPLETED",
      createdDaysAgo: 21,
      sentDaysAgo: 21,
      completedDaysAgo: 18,
      signers: [
        { key: "a", email: "m.calloway@brightwatercapital.com", name: "Miriam Calloway", status: "SIGNED", signedDaysAgo: 19, viewedDaysAgo: 21 },
        { key: "b", email: "demo@larkfield.io", name: "Avery Holt", status: "SIGNED", signedDaysAgo: 18, viewedDaysAgo: 19 },
      ],
    },
    {
      key: "declined-consultancy",
      doc: "msa",
      title: "Consultancy agreement - Pemberton Clarke",
      message: "As discussed on Tuesday. Shout if the indemnity wording needs work.",
      status: "DECLINED",
      createdDaysAgo: 16,
      sentDaysAgo: 16,
      signers: [
        {
          key: "a",
          email: "o.mensah@pembertonclarke.com",
          name: "Osei Mensah",
          status: "DECLINED",
          viewedDaysAgo: 15,
          declinedDaysAgo: 14,
          declineReason:
            "The liability cap does not match what we agreed on the call. Happy to sign a revised version.",
        },
        { key: "b", email: "tom.eriksen@larkfield.io", name: "Tom Eriksen", status: "SENT" },
      ],
    },
    {
      key: "expired-dpa",
      doc: "dpa",
      title: "Data processing addendum - Northlake Health",
      message: "Addendum to the platform subscription. Please sign before the quarter closes.",
      status: "EXPIRED",
      createdDaysAgo: 45,
      sentDaysAgo: 45,
      expiredDaysAgo: 15,
      signers: [
        { key: "a", email: "s.duval@northlakehealth.com", name: "Sylvie Duval", status: "SENT", viewedDaysAgo: 38 },
        { key: "b", email: "tom.eriksen@larkfield.io", name: "Tom Eriksen", status: "SENT" },
      ],
    },
  ];

  for (const env of ENVELOPES) {
    const d = doc(env.doc);
    const reqId = sid(`sig:${env.key}`);
    const pdfKey = `${T}/demo-sign/${env.key}.pdf`;
    const source = pdfBytes.get(env.doc)!;
    await put(pdfKey, Buffer.from(source), "application/pdf");

    let signedFileKey: string | null = null;
    let finalHash: string | null = null;
    if (env.status === "COMPLETED") {
      const signed = await buildSignedPdf(
        source,
        env.title,
        env.signers
          .filter((s) => s.status === "SIGNED")
          .map((s) => ({
            name: s.name,
            email: s.email,
            when: atDay(s.signedDaysAgo ?? 1, 11, 20),
            ip: `81.${randInt(10, 240)}.${randInt(10, 240)}.${randInt(2, 250)}`,
          }))
      );
      signedFileKey = `${T}/demo-sign/${env.key}-signed.pdf`;
      await put(signedFileKey, Buffer.from(signed), "application/pdf");
      finalHash = createHash("sha256").update(Buffer.from(signed)).digest("hex");
    }

    await db.signatureRequest.create({
      data: {
        id: reqId,
        teamId: T,
        documentId: d.id,
        versionId: d.versionId,
        pdfKey,
        title: env.title,
        message: env.message,
        status: env.status,
        sequential: env.sequential ?? false,
        requireEmailVerification: env.key === "completed-term-sheet",
        expiresAt: env.expiresInDays
          ? daysFromNow(env.expiresInDays)
          : env.expiredDaysAgo
            ? atDay(env.expiredDaysAgo, 23, 59)
            : null,
        reminderEveryDays: env.status === "SENT" ? 3 : null,
        lastReminderAt: env.status === "SENT" ? atDay(2, 8, 0) : null,
        createdById: userId("tom"),
        sentAt: env.sentDaysAgo ? atDay(env.sentDaysAgo, 10, 5) : null,
        completedAt: env.completedDaysAgo ? atDay(env.completedDaysAgo, 11, 40) : null,
        signedFileKey,
        finalHash,
        createdAt: atDay(env.createdDaysAgo, 9, 50),
      },
    });

    const events: Prisma.SigningEventCreateManyInput[] = [
      {
        id: sid(`se:${env.key}:created`),
        requestId: reqId,
        type: "created",
        meta: { by: "tom.eriksen@larkfield.io" },
        createdAt: atDay(env.createdDaysAgo, 9, 50),
      },
    ];

    let fieldSeq = 0;
    for (let i = 0; i < env.signers.length; i++) {
      const s = env.signers[i];
      const signerId = sid(`signer:${env.key}:${s.key}`);
      const ip = `81.${randInt(10, 240)}.${randInt(10, 240)}.${randInt(2, 250)}`;
      const ua =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
      const signed = s.status === "SIGNED";
      await db.signer.create({
        data: {
          id: signerId,
          requestId: reqId,
          email: s.email,
          name: s.name,
          role: s.role ?? "SIGNER",
          order: s.order ?? 0,
          token: tok(`signer:${env.key}:${s.key}`),
          status: s.status,
          verified: signed,
          signatureData: signed ? (i % 2 === 0 ? sig1 : sig2) : null,
          initialsData: signed ? dataUrl(signaturePng(300 + i, true)) : null,
          viewedAt: s.viewedDaysAgo ? atDay(s.viewedDaysAgo, 10, 30) : null,
          signedAt: s.signedDaysAgo ? atDay(s.signedDaysAgo, 11, 20) : null,
          declinedAt: s.declinedDaysAgo ? atDay(s.declinedDaysAgo, 16, 10) : null,
          declineReason: s.declineReason ?? null,
          lastSentAt: env.sentDaysAgo ? atDay(env.sentDaysAgo, 10, 6) : null,
          ip: s.status === "PENDING" ? null : ip,
          userAgent: s.status === "PENDING" ? null : ua,
        },
      });

      // Fields land on the execution page - a real rect on a real page.
      if ((s.role ?? "SIGNER") === "SIGNER") {
        const page = Math.max(1, Math.min(d.numPages ?? 1, (d.numPages ?? 1) - 0));
        const rowY = 0.6 + fieldSeq * 0.12;
        const fields = [
          { kind: "SIGNATURE" as const, xPct: 0.1, yPct: rowY, wPct: 0.24, hPct: 0.055 },
          { kind: "INITIALS" as const, xPct: 0.38, yPct: rowY, wPct: 0.07, hPct: 0.04 },
          { kind: "DATE_SIGNED" as const, xPct: 0.5, yPct: rowY, wPct: 0.16, hPct: 0.03 },
          { kind: "TEXT" as const, xPct: 0.7, yPct: rowY, wPct: 0.2, hPct: 0.03 },
        ];
        for (const f of fields) {
          const isText = f.kind === "TEXT";
          await db.signatureField.create({
            data: {
              id: sid(`sf:${env.key}:${s.key}:${f.kind}`),
              requestId: reqId,
              signerId,
              kind: f.kind,
              page,
              xPct: f.xPct,
              yPct: f.yPct,
              wPct: f.wPct,
              hPct: f.hPct,
              required: !isText,
              value: signed
                ? f.kind === "DATE_SIGNED"
                  ? atDay(s.signedDaysAgo ?? 1, 11, 20).toISOString().slice(0, 10)
                  : isText
                    ? s.name.split(" ").slice(-1)[0] === "Holt"
                      ? "Chief Executive"
                      : "Authorised signatory"
                    : null
                : null,
              filledAt: signed ? atDay(s.signedDaysAgo ?? 1, 11, 20) : null,
            },
          });
        }
        fieldSeq++;
      }

      if (env.sentDaysAgo)
        events.push({
          id: sid(`se:${env.key}:${s.key}:sent`),
          requestId: reqId,
          signerId,
          type: "sent",
          meta: { email: s.email },
          createdAt: atDay(env.sentDaysAgo, 10, 6),
        });
      if (s.viewedDaysAgo)
        events.push({
          id: sid(`se:${env.key}:${s.key}:viewed`),
          requestId: reqId,
          signerId,
          type: "viewed",
          ip,
          userAgent: ua,
          createdAt: atDay(s.viewedDaysAgo, 10, 30),
        });
      if (signed) {
        events.push({
          id: sid(`se:${env.key}:${s.key}:consented`),
          requestId: reqId,
          signerId,
          type: "consented",
          meta: { action: "Agree and sign" },
          ip,
          userAgent: ua,
          createdAt: atDay(s.signedDaysAgo!, 11, 19),
        });
        events.push({
          id: sid(`se:${env.key}:${s.key}:signed`),
          requestId: reqId,
          signerId,
          type: "signed",
          ip,
          userAgent: ua,
          createdAt: atDay(s.signedDaysAgo!, 11, 20),
        });
      }
      if (s.declinedDaysAgo)
        events.push({
          id: sid(`se:${env.key}:${s.key}:declined`),
          requestId: reqId,
          signerId,
          type: "declined",
          meta: { reason: s.declineReason },
          ip,
          userAgent: ua,
          createdAt: atDay(s.declinedDaysAgo, 16, 10),
        });
    }

    if (env.status === "SENT")
      events.push({
        id: sid(`se:${env.key}:reminded`),
        requestId: reqId,
        type: "reminded",
        meta: { round: 1 },
        createdAt: atDay(2, 8, 0),
      });
    if (env.completedDaysAgo)
      events.push({
        id: sid(`se:${env.key}:completed`),
        requestId: reqId,
        type: "completed",
        meta: { hash: finalHash },
        createdAt: atDay(env.completedDaysAgo, 11, 40),
      });
    if (env.expiredDaysAgo)
      events.push({
        id: sid(`se:${env.key}:expired`),
        requestId: reqId,
        type: "expired",
        createdAt: atDay(env.expiredDaysAgo, 0, 5),
      });

    await db.signingEvent.createMany({ data: events });
  }

  // ---- notifications (read and unread) ----
  await db.notification.deleteMany({ where: { teamId: T } });
  const notifications: Prisma.NotificationCreateManyInput[] = [
    {
      type: "dataroom_visited",
      payload: {
        who: "m.calloway@brightwatercapital.com",
        itemName: "Series B - Larkfield Instruments",
        linkName: "Series B - Brightwater (lead)",
        href: `/datarooms/${sid("room:series-b")}?tab=analytics`,
      },
      createdAt: hoursAgo(0.6),
      readAt: null,
    },
    {
      type: "access_requested",
      payload: {
        who: "r.delacroix@havenridgecapital.com",
        linkName: "Series B - process (email gate)",
        detail:
          "We met at the industrials showcase in May. Would like to look at the financials.",
        href: "/dashboard",
      },
      createdAt: hoursAgo(4.5),
      readAt: null,
    },
    {
      type: "document_viewed",
      payload: {
        who: "d.aziz@kestrelbridge.com",
        itemName: "Due diligence memo - Project Meridian",
        linkName: "Project Meridian - buy-side advisers",
        href: `/documents/${doc("dd-memo").id}`,
      },
      createdAt: hoursAgo(1.9),
      readAt: null,
    },
    {
      type: "new_question",
      payload: {
        who: "s.whitfield@northaxis.com",
        itemName: "Series B - Larkfield Instruments",
        detail:
          "Can you share the churn detail behind the two pilot accounts mentioned in the retention note?",
        href: `/datarooms/${sid("room:series-b")}?tab=qa`,
      },
      createdAt: hoursAgo(9),
      readAt: null,
    },
    {
      type: "blocked_access",
      payload: {
        who: "unknown@gmail.com",
        linkName: "Northlake Health - procurement",
        detail: "blocked domain",
        href: `/links/${sid("link:northlake-diligence")}`,
      },
      createdAt: hoursAgo(14),
      readAt: null,
    },
    {
      type: "document_viewed",
      payload: {
        who: "y.bergstrom@vantagerowe.com",
        itemName: "Financial model summary FY26-FY29",
        linkName: "Financial model - investors only",
        href: `/documents/${doc("model").id}`,
      },
      createdAt: hoursAgo(7.5),
      readAt: hoursAgo(6),
    },
    {
      type: "new_question",
      payload: {
        who: "d.aziz@kestrelbridge.com",
        itemName: "Project Meridian - Kesten Works",
        detail: "Is the Munich lease assignable, or does it need landlord consent?",
        href: `/datarooms/${sid("room:meridian")}?tab=qa`,
      },
      createdAt: hoursAgo(30),
      readAt: hoursAgo(28),
    },
    {
      type: "dataroom_visited",
      payload: {
        who: "chair@larkfieldboard.com",
        itemName: "Board pack - Q2 2026",
        linkName: "Board pack Q2 - directors",
        href: `/datarooms/${sid("room:board")}?tab=analytics`,
      },
      createdAt: atDay(2, 20, 15),
      readAt: atDay(2, 21, 0),
    },
    {
      type: "document_viewed",
      payload: {
        who: null,
        itemName: "Series B investor deck",
        linkName: "Investor deck - general",
        href: `/documents/${doc("deck").id}`,
      },
      createdAt: atDay(3, 11, 25),
      readAt: atDay(3, 12, 0),
    },
    {
      type: "file_uploaded",
      payload: {
        itemName: "Series B - Larkfield Instruments",
        href: `/datarooms/${sid("room:series-b")}`,
      },
      createdAt: atDay(4, 9, 5),
      readAt: atDay(4, 9, 30),
    },
    {
      type: "document_viewed",
      payload: {
        who: "n.fairweather@hollowayfield.com",
        itemName: "Master services agreement - template v4",
        linkName: "Series B - legal counsel (scoped)",
        href: `/documents/${doc("msa").id}`,
      },
      createdAt: atDay(5, 15, 45),
      readAt: atDay(5, 16, 20),
    },
    {
      type: "blocked_access",
      payload: {
        who: "t.mccrae@competitor-sensing.com",
        linkName: "Northlake Health - procurement",
        detail: "blocked domain",
        href: `/links/${sid("link:northlake-diligence")}`,
      },
      createdAt: atDay(7, 13, 10),
      readAt: atDay(7, 14, 0),
    },
    {
      type: "dataroom_visited",
      payload: {
        who: "t.nakamura@meridiangrowth.vc",
        itemName: "Series B - Larkfield Instruments",
        linkName: "Series B - Meridian (NDA gate)",
        href: `/datarooms/${sid("room:series-b")}?tab=analytics`,
      },
      createdAt: atDay(8, 10, 50),
      readAt: atDay(8, 11, 30),
    },
    {
      type: "document_viewed",
      payload: {
        who: "k.reinhardt@kestenworks.de",
        itemName: "Manufacturing supply agreement - Kesten Works",
        linkName: "Project Meridian - buy-side advisers",
        href: `/documents/${doc("supply").id}`,
      },
      createdAt: atDay(9, 16, 5),
      readAt: atDay(9, 17, 0),
    },
  ].map((n, i) => ({ id: sid(`notif:${i}`), teamId: T, ...n }));
  await db.notification.createMany({ data: notifications });

  // ---- webhook delivery history, including a failure ----
  await db.webhookDelivery.createMany({
    data: [
      {
        id: sid("wd:1"),
        webhookId: sid("hook:crm"),
        event: "dataroom.visited",
        payload: {
          event: "dataroom.visited",
          data: {
            who: "m.calloway@brightwatercapital.com",
            itemName: "Series B - Larkfield Instruments",
          },
        },
        statusCode: 200,
        createdAt: hoursAgo(0.6),
      },
      {
        id: sid("wd:2"),
        webhookId: sid("hook:crm"),
        event: "document.viewed",
        payload: {
          event: "document.viewed",
          data: {
            who: "d.aziz@kestrelbridge.com",
            itemName: "Due diligence memo - Project Meridian",
          },
        },
        statusCode: 200,
        createdAt: hoursAgo(1.9),
      },
      {
        id: sid("wd:3"),
        webhookId: sid("hook:crm"),
        event: "document.viewed",
        payload: {
          event: "document.viewed",
          data: { who: null, itemName: "Series B investor deck" },
        },
        statusCode: 502,
        error: "Bad gateway",
        createdAt: hoursAgo(19),
      },
      {
        id: sid("wd:4"),
        webhookId: sid("hook:crm"),
        event: "link.created",
        payload: {
          event: "link.created",
          data: { linkName: "Deck teaser - closing this week" },
        },
        statusCode: null,
        error: "The operation was aborted due to timeout",
        createdAt: atDay(9, 12, 35),
      },
      {
        id: sid("wd:5"),
        webhookId: sid("hook:crm"),
        event: "link.created",
        payload: {
          event: "link.created",
          data: { linkName: "Northlake Health - procurement" },
        },
        statusCode: 200,
        createdAt: atDay(18, 10, 15),
      },
    ],
  });

  // ---- second team: small but not empty ----
  await seedSecondTeam(T2, userId("avery"));

  await report(T, T2);
}

/** A handful of rows so switching teams lands somewhere credible. */
async function seedSecondTeam(T2: string, ownerId: string) {
  const folderId = sid("t2:folder:clients");
  await db.folder.upsert({
    where: { id: folderId },
    update: {},
    create: { id: folderId, teamId: T2, name: "Client mandates", createdAt: atDay(80, 10, 0) },
  });

  const specs = [
    { key: "engagement", name: "Engagement letter - standard form", pages: 6, theme: "legal" as Theme },
    { key: "mandate", name: "Sell-side mandate summary", pages: 8, theme: "commercial" as Theme },
    { key: "fee-note", name: "Fee note - Q2 2026", pages: 3, theme: "financial" as Theme },
  ];
  const created: DocRow[] = [];
  for (const s of specs) {
    const bytes = await buildPdf({
      title: s.name,
      subtitle: "Harbour Lane Advisors - client materials",
      pages: s.pages,
      headings: ["Scope", "Terms", "Fees", "Appendix"],
      theme: s.theme,
      reference: "HL-2026",
    });
    const key = `${T2}/demo-${s.key}/v1/${s.key}.pdf`;
    await put(key, Buffer.from(bytes), "application/pdf");
    const docId = sid(`t2:doc:${s.key}`);
    const versionId = sid(`t2:ver:${s.key}`);
    await db.document.upsert({
      where: { id: docId },
      update: { name: s.name },
      create: {
        id: docId,
        teamId: T2,
        name: s.name,
        type: "PDF",
        folderId,
        createdAt: atDay(randInt(20, 70), 11, 0),
      },
    });
    await db.documentVersion.upsert({
      where: { id: versionId },
      update: { fileKey: key, fileSize: bytes.length, numPages: s.pages },
      create: {
        id: versionId,
        documentId: docId,
        versionNumber: 1,
        fileKey: key,
        fileName: `${s.key}.pdf`,
        fileSize: bytes.length,
        contentType: "application/pdf",
        numPages: s.pages,
        uploadedById: ownerId,
        createdAt: atDay(randInt(20, 70), 11, 5),
      },
    });
    await db.document.update({ where: { id: docId }, data: { currentVersionId: versionId } });
    created.push({
      key: s.key,
      id: docId,
      versionId,
      numPages: s.pages,
      keyPage: null,
      name: s.name,
    });
  }

  const roomId = sid("t2:room:mandates");
  await db.dataroom.upsert({
    where: { id: roomId },
    update: {},
    create: {
      id: roomId,
      teamId: T2,
      name: "Client onboarding pack",
      description: "Standard forms sent to new mandates.",
      createdAt: atDay(72, 12, 0),
    },
  });
  for (let i = 0; i < created.length; i++) {
    await db.dataroomDocument.upsert({
      where: {
        dataroomId_documentId: { dataroomId: roomId, documentId: created[i].id },
      },
      update: { orderIndex: i },
      create: {
        id: sid(`t2:rd:${created[i].key}`),
        dataroomId: roomId,
        documentId: created[i].id,
        orderIndex: i,
        createdAt: atDay(71, 12, i),
      },
    });
  }

  const linkId = sid("t2:link:onboarding");
  await db.link.upsert({
    where: { id: linkId },
    update: {},
    create: {
      id: linkId,
      teamId: T2,
      target: "DATAROOM",
      dataroomId: roomId,
      name: "Client onboarding - standard pack",
      slug: "harbour-lane-onboarding",
      accessMode: "EMAIL",
      enableIndexFile: true,
      createdAt: atDay(70, 12, 30),
    },
  });

  const emails = ["r.vance@ashcombeholdings.com", "l.tanaka@ashcombeholdings.com"];
  for (const email of emails) {
    await db.viewer.upsert({
      where: { teamId_email: { teamId: T2, email } },
      update: {},
      create: {
        id: sid(`t2:viewer:${email}`),
        teamId: T2,
        email,
        verified: true,
        createdAt: atDay(40, 10, 0),
      },
    });
  }
  const t2Viewers = new Map(
    (await db.viewer.findMany({ where: { teamId: T2 } })).map((v) => [v.email, v.id])
  );

  const views: Prisma.ViewCreateManyInput[] = [];
  const pvs: Prisma.PageViewCreateManyInput[] = [];
  let n = 0;
  for (let day = 30; day >= 0; day -= 3) {
    const email = emails[n % emails.length];
    const d = created[n % created.length];
    const id = sid(`t2:view:${n}`);
    const total = gauss(150, 70, 25, 420);
    views.push({
      id,
      linkId,
      viewerId: t2Viewers.get(email)!,
      viewerEmail: email,
      documentId: d.id,
      dataroomId: roomId,
      verified: true,
      startedAt: atDay(day, randInt(9, 17), randInt(0, 59)),
      lastActiveAt: atDay(day, randInt(9, 17), randInt(0, 59)),
      totalDuration: total,
      completedPct: randInt(45, 100),
      country: "United Kingdom",
      city: "London",
      browser: "Chrome",
      os: "macOS",
      device: "Desktop",
    });
    for (let p = 1; p <= (d.numPages ?? 1); p++)
      pvs.push({
        id: sid(`t2:pv:${n}:${p}`),
        viewId: id,
        versionId: d.versionId,
        pageNumber: p,
        duration: Math.max(4, Math.round(total / (d.numPages ?? 1))),
      });
    n++;
  }
  await db.view.createMany({ data: views });
  await db.pageView.createMany({ data: pvs });
}

async function resetDemo() {
  const teams = await db.team.findMany({
    where: { slug: { in: [TEAM_SLUG, TEAM2_SLUG] } },
    select: { id: true },
  });
  for (const t of teams) await db.team.delete({ where: { id: t.id } });
  await db.user.deleteMany({ where: { email: { in: MEMBERS.map((m) => m.email) } } });
  console.log(`reset: removed ${teams.length} demo team(s) and their users`);
}

async function report(T: string, T2: string) {
  const teamIds = [T, T2];
  const counts = {
    User: await db.user.count({ where: { memberships: { some: { teamId: { in: teamIds } } } } }),
    Team: await db.team.count({ where: { id: { in: teamIds } } }),
    TeamMember: await db.teamMember.count({ where: { teamId: { in: teamIds } } }),
    TeamInvite: await db.teamInvite.count({ where: { teamId: { in: teamIds } } }),
    ResourcePermission: await db.resourcePermission.count({
      where: { member: { teamId: { in: teamIds } } },
    }),
    NotificationPreference: await db.notificationPreference.count({
      where: { teamId: { in: teamIds } },
    }),
    Folder: await db.folder.count({ where: { teamId: { in: teamIds } } }),
    Document: await db.document.count({ where: { teamId: { in: teamIds } } }),
    DocumentVersion: await db.documentVersion.count({
      where: { document: { teamId: { in: teamIds } } },
    }),
    Dataroom: await db.dataroom.count({ where: { teamId: { in: teamIds } } }),
    DataroomFolder: await db.dataroomFolder.count({
      where: { dataroom: { teamId: { in: teamIds } } },
    }),
    DataroomDocument: await db.dataroomDocument.count({
      where: { dataroom: { teamId: { in: teamIds } } },
    }),
    DataroomQuestion: await db.dataroomQuestion.count({
      where: { dataroom: { teamId: { in: teamIds } } },
    }),
    Link: await db.link.count({ where: { teamId: { in: teamIds } } }),
    LinkPermission: await db.linkPermission.count({
      where: { link: { teamId: { in: teamIds } } },
    }),
    LinkRecipient: await db.linkRecipient.count({
      where: { link: { teamId: { in: teamIds } } },
    }),
    AccessRequest: await db.accessRequest.count({ where: { teamId: { in: teamIds } } }),
    Viewer: await db.viewer.count({ where: { teamId: { in: teamIds } } }),
    View: await db.view.count({ where: { link: { teamId: { in: teamIds } } } }),
    PageView: await db.pageView.count({
      where: { view: { link: { teamId: { in: teamIds } } } },
    }),
    MouseBatch: await db.mouseBatch.count({
      where: { view: { link: { teamId: { in: teamIds } } } },
    }),
    Agreement: await db.agreement.count({ where: { teamId: { in: teamIds } } }),
    AgreementResponse: await db.agreementResponse.count({
      where: { agreement: { teamId: { in: teamIds } } },
    }),
    SignatureRequest: await db.signatureRequest.count({ where: { teamId: { in: teamIds } } }),
    Signer: await db.signer.count({ where: { request: { teamId: { in: teamIds } } } }),
    SignatureField: await db.signatureField.count({
      where: { request: { teamId: { in: teamIds } } },
    }),
    SigningEvent: await db.signingEvent.count({
      where: { request: { teamId: { in: teamIds } } },
    }),
    Branding: await db.branding.count({ where: { teamId: { in: teamIds } } }),
    Domain: await db.domain.count({ where: { teamId: { in: teamIds } } }),
    LinkPreset: await db.linkPreset.count({ where: { teamId: { in: teamIds } } }),
    PreviewPreset: await db.previewPreset.count({ where: { teamId: { in: teamIds } } }),
    Notification: await db.notification.count({ where: { teamId: { in: teamIds } } }),
    ApiToken: await db.apiToken.count({ where: { teamId: { in: teamIds } } }),
    Webhook: await db.webhook.count({ where: { teamId: { in: teamIds } } }),
    WebhookDelivery: await db.webhookDelivery.count({
      where: { webhook: { teamId: { in: teamIds } } },
    }),
  };

  const rows = Object.entries(counts)
    .map(([k, v]) => `  ${k.padEnd(24)} ${String(v).padStart(6)}`)
    .join("\n");
  console.log(
    [
      "",
      "Demo workspace ready.",
      "",
      rows,
      `  ${"objects uploaded".padEnd(24)} ${String(uploads).padStart(6)}`,
      "",
      `Sign in as:      ${OWNER_EMAIL}`,
      `Entry URL:       <origin>/api/demo-login  (needs DEMO_LOGIN_EMAIL=${OWNER_EMAIL})`,
      `Link password:   ${LINK_PASSWORD}  (Project Meridian link)`,
      `API token:       ${API_KEY_PLAIN}`,
      `API token (2):   ${API_KEY_PLAIN_CI}`,
      "",
    ].join("\n")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
