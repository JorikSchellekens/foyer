/* The MCP endpoint, end to end, over HTTP like a real client: what each key
   may do (scopes, team isolation, members limited to certain rooms, dead
   keys), structuring a room, uploads through one-time commands, sharing, and
   deletes. Seeds its own two teams and removes nothing else.

   Needs the dev stack and a dev server that cannot send email, e.g.:
     docker compose -f docker-compose.dev.yml up -d
     RESEND_API_KEY= NEXT_PUBLIC_APP_URL=http://localhost:3216 bunx next dev -p 3216 &
     APP_URL=http://localhost:3216 bun run scripts/mcp-e2e.ts

   The last check exhausts the per-minute call limit on purpose, so wait a
   minute before running it again against the same server.
*/
/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are free-form JSON */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createHash } from "crypto";

const db = new PrismaClient();
const BASE = process.env.APP_URL ?? "http://localhost:3216";
const sha = (k: string) => createHash("sha256").update(k).digest("hex");

let fails = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && detail ? `\n     ${detail.slice(0, 400)}` : ""}`);
};

type Out = { ok: boolean; text: string; data: any };

async function connect(key: string) {
  const client = new Client({ name: "mcp-e2e", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    })
  );
  return async (tool: string, args: Record<string, unknown> = {}): Promise<Out> => {
    try {
      const res = await client.callTool({ name: tool, arguments: args });
      const text = (res.content as { text?: string }[]).map((c) => c.text ?? "").join("");
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}
      return { ok: !res.isError, text, data };
    } catch (e) {
      return { ok: false, text: String(e), data: null };
    }
  };
}

async function pdfBytes(title: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([595, 842]).drawText(title, { x: 60, y: 760, size: 20, font });
  return Buffer.from(await pdf.save());
}

/** Run the upload command request_upload returned, the way curl would. */
async function runUpload(command: string, body: Buffer | string, headers: Record<string, string> = {}) {
  const url = command.match(/"(https?:\/\/[^"]+)"$/)![1];
  const secret = command.match(/Bearer (fup_[A-Za-z0-9_-]+)/)![1];
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${secret}`, ...headers },
    body: typeof body === "string" ? body : new Uint8Array(body),
  });
  return { status: res.status, json: (await res.json()) as any, url, secret };
}

async function seed() {
  const mk = async (slug: string, name: string) => {
    const team = await db.team.upsert({ where: { slug }, update: {}, create: { slug, name } });
    await db.link.deleteMany({ where: { teamId: team.id } });
    await db.dataroom.deleteMany({ where: { teamId: team.id } });
    await db.document.deleteMany({ where: { teamId: team.id } });
    await db.folder.deleteMany({ where: { teamId: team.id } });
    await db.apiToken.deleteMany({ where: { teamId: team.id } });
    await db.apiTokenEvent.deleteMany({ where: { teamId: team.id } });
    return team;
  };
  const user = async (email: string) =>
    db.user.upsert({ where: { email }, update: {}, create: { email } });
  const join = async (teamId: string, userId: string, role: "OWNER" | "MEMBER") =>
    db.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: { role },
      create: { teamId, userId, role },
    });
  const A = await mk("mcp-e2e-a", "MCP E2E A");
  const B = await mk("mcp-e2e-b", "MCP E2E B");
  const ownerA = await user("mcp-owner-a@example.com");
  const ownerB = await user("mcp-owner-b@example.com");
  const limited = await user("mcp-limited@example.com");
  const gone = await user("mcp-gone@example.com");
  await join(A.id, ownerA.id, "OWNER");
  await join(B.id, ownerB.id, "OWNER");
  const limitedMember = await join(A.id, limited.id, "MEMBER");
  await db.teamMember.deleteMany({ where: { userId: gone.id } });
  await db.resourcePermission.deleteMany({ where: { memberId: limitedMember.id } });

  const key = async (label: string, teamId: string, userId: string, scopes: string[], expiresAt: Date | null = null) => {
    const k = `foyer_e2e_${label}_${"0".repeat(24)}`;
    await db.apiToken.deleteMany({ where: { hashedKey: sha(k) } });
    await db.apiToken.create({
      data: { name: label, teamId, userId, hashedKey: sha(k), partialKey: k.slice(0, 12), scopes, expiresAt },
    });
    return k;
  };
  const all = ["read", "write", "share", "delete"];
  return {
    A, B, limitedMember,
    full: await key("full", A.id, ownerA.id, all),
    read: await key("read", A.id, ownerA.id, ["read"]),
    organise: await key("organise", A.id, ownerA.id, ["read", "write"]),
    limited: await key("limited", A.id, limited.id, all),
    other: await key("other", B.id, ownerB.id, all),
    expired: await key("expired", A.id, ownerA.id, all, new Date(Date.now() - 1000)),
    gone: await key("gone", A.id, gone.id, all),
  };
}

(async () => {
  const s = await seed();
  const full = await connect(s.full);
  const read = await connect(s.read);
  const organise = await connect(s.organise);
  const other = await connect(s.other);

  // ---- dead keys ----
  for (const [label, key] of [["expired", s.expired], ["ex-member", s.gone], ["made-up", "foyer_nope"]] as const) {
    const res = await fetch(`${BASE}/api/mcp/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    check(`${label} key is refused on MCP`, res.status === 401, String(res.status));
    const rest = await fetch(`${BASE}/api/v1/documents`, { headers: { Authorization: `Bearer ${key}` } });
    check(`${label} key is refused on REST`, rest.status === 401, String(rest.status));
  }

  // ---- workspace + scopes ----
  const ws = await read("get_workspace");
  check("get_workspace says what a read-only key can do", ws.data?.can?.read === true && ws.data?.can?.addAndOrganise === false, ws.text);
  check("read-only key cannot create a room", !(await read("create_dataroom", { name: "nope" })).ok);
  check("organise key cannot create a link", !(await organise("create_sharing_link", { dataroomId: "c".repeat(25) })).ok);
  const noDelete = await organise("delete_documents", { documentIds: ["c".repeat(25)] });
  check("organise key cannot delete, and is told in get_workspace's terms", !noDelete.ok && /can\.deletePermanently/.test(noDelete.text), noDelete.text);
  const unknownArg = await read("list_documents", { bogus: 1 });
  check("unknown arguments are an error, not silently dropped", !unknownArg.ok, unknownArg.text);

  // ---- uploads ----
  const room = (await full("create_dataroom", { name: "E2E room", description: "for tests" })).data;
  check("create a data room", !!room?.dataroomId);
  const up = await full("request_upload", {
    dataroomId: room.dataroomId,
    files: [
      { fileName: "scan_01.pdf", dataroomFolderPath: "Inbox" },
      { fileName: "scan_02.pdf", dataroomFolderPath: "Inbox" },
      { fileName: "notes.txt" },
      { fileName: "data.csv" },
    ],
  });
  check("request_upload returns one command per file", up.data?.uploads?.length === 4, up.text);
  const cmds: string[] = up.data.uploads.map((u: any) => u.command);
  check("upload commands show the server's error on failure", cmds[0].includes("--fail-with-body"));
  const d1 = await runUpload(cmds[0], await pdfBytes("Capitalisation table for Halden Robotics"));
  const d2 = await runUpload(cmds[1], await pdfBytes("Investor deck seed extension"));
  check("upload a PDF", d1.status === 200 && d1.json.type === "PDF" && d1.json.pages === 1, JSON.stringify(d1.json));
  const again = await runUpload(cmds[0], await pdfBytes("again"));
  check("an upload command works once", again.status === 409, JSON.stringify(again.json));
  const [r1, r2] = await Promise.all([
    runUpload(cmds[3], "customer,arr\nBrightline,180000\n"),
    runUpload(cmds[3], "customer,arr\nBrightline,180000\n"),
  ]);
  check("two uploads racing on one command make one document", [r1.status, r2.status].sort().join() === "200,409", `${r1.status},${r2.status}`);
  const csvId = (r1.status === 200 ? r1 : r2).json.documentId;
  const html = await runUpload(cmds[2], "<script>alert(1)</script>", { "content-type": "text/html" });
  check("a .txt upload is accepted", html.status === 200, JSON.stringify(html.json));
  const stored = await db.documentVersion.findFirst({ where: { documentId: html.json.documentId } });
  check("the stored content type ignores what the client declared", stored?.contentType.startsWith("text/plain") === true, stored?.contentType);
  const fake = await full("request_upload", { files: [{ fileName: "fake.pdf" }] });
  const fakeRes = await runUpload(fake.data.uploads[0].command, "<html>login</html>");
  check("a web page named .pdf is refused", fakeRes.status === 415, JSON.stringify(fakeRes.json));
  const noAuth = await fetch(d1.url, { method: "PUT", body: "x" });
  check("an upload without its token is refused", noAuth.status === 401);
  const inQuery = await fetch(`${d1.url}?token=${d1.secret}`, { method: "PUT", body: "x" });
  check("the token is not accepted in the URL", inQuery.status === 401);

  // ---- reading ----
  const prev = await full("get_document_previews", { documentIds: [d1.json.documentId, d2.json.documentId, csvId] });
  check("previews read several documents at once", prev.data?.previews?.length === 3 && /Capitalisation/.test(prev.data.previews[0].text), prev.text);
  check("a spreadsheet can be read", /Brightline/.test(prev.data?.previews?.[2]?.text ?? ""), prev.text);
  const long = await full("create_text_document", { name: "Long", content: "x".repeat(5000) });
  const page1 = await full("get_document_text", { documentId: long.data.documentId, maxChars: 2000 });
  const page2 = await full("get_document_text", { documentId: long.data.documentId, maxChars: 2000, startChar: page1.data?.nextStartChar });
  check("long text can be read in pieces", page1.data?.nextStartChar === 2000 && page2.data?.nextStartChar === 4000, page1.text.slice(0, 200));

  // ---- structuring ----
  const dry = await full("organize_dataroom", {
    dataroomId: room.dataroomId,
    dryRun: true,
    placements: [{ documentId: d1.json.documentId, folderPath: "01 Legal/Cap table", name: "Capitalisation table" }],
  });
  check("a dry run reports the plan", dry.data?.dryRun === true && dry.data?.moved?.[0]?.fromFolderPath === "Inbox", dry.text);
  const stillName = await db.document.findUnique({ where: { id: d1.json.documentId } });
  check("a dry run changes nothing", stillName?.name === "scan_01", stillName?.name);
  const org = await full("organize_dataroom", {
    dataroomId: room.dataroomId,
    order: "listed_first",
    placements: [
      { documentId: d2.json.documentId, folderPath: "", name: "Investor deck" },
      { documentId: d1.json.documentId, folderPath: "01 Legal", name: "Capitalisation table" },
      { documentId: csvId, folderPath: "02 Commercial" },
    ],
  });
  check("organise places, renames and creates folders in one call", org.data?.renamed?.length === 2 && org.data?.foldersCreated?.length === 2, org.text);
  const typo = await full("organize_dataroom", {
    dataroomId: room.dataroomId,
    dryRun: true,
    placements: [{ documentId: csvId, folderPath: "Legal" }],
  });
  check("a near-duplicate folder name is warned about", /01 Legal/.test(JSON.stringify(typo.data?.warnings ?? "")), typo.text);
  const typo2 = await full("organize_dataroom", {
    dataroomId: room.dataroomId,
    dryRun: true,
    placements: [{ documentId: csvId, folderPath: "Leagl" }],
  });
  check("a misspelt folder name is warned about, in the future tense on a dry run", /would create.*01 Legal/i.test(JSON.stringify(typo2.data?.warnings ?? "")), typo2.text);
  const cased = await full("organize_dataroom", {
    dataroomId: room.dataroomId,
    dryRun: true,
    placements: [{ documentId: csvId, folderPath: "01 legal/" }],
  });
  check("results use the folder's own spelling", cased.data?.moved?.[0]?.folderPath === "01 Legal", cased.text);
  const strict = await full("organize_dataroom", {
    dataroomId: room.dataroomId,
    createFolders: false,
    placements: [{ documentId: csvId, folderPath: "Leagl" }],
  });
  check("createFolders false turns a misspelt path into an error that suggests the folder", !strict.ok && /no folder "Leagl"/.test(strict.text) && /Did you mean "01 Legal"/.test(strict.text), strict.text);
  const tree1 = await full("get_dataroom", { dataroomId: room.dataroomId });
  check("listed_first puts the listed document first", tree1.data?.contents?.[0]?.name === "Investor deck", JSON.stringify(tree1.data?.contents?.map((c: any) => c.name)));
  const ren = await full("update_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "02 Commercial", name: "02 Customers" });
  check("a folder can be renamed by path", ren.data?.folderPath === "02 Customers", ren.text);
  const legal = tree1.data.contents.find((c: any) => c.name === "01 Legal");
  const reorder = await full("reorder_dataroom", { dataroomId: room.dataroomId, order: [{ folderId: legal.folderId }] });
  check("reorder returns the new order", reorder.data?.order?.[0]?.name === "01 Legal", reorder.text);
  const badOrder = await full("reorder_dataroom", { dataroomId: room.dataroomId, order: [{ documentId: d1.json.documentId }] });
  check("reordering an item from another folder says where it is", !badOrder.ok && /is in 01 Legal/.test(badOrder.text), badOrder.text);
  const removed = await full("remove_from_dataroom", { dataroomId: room.dataroomId, documentIds: [csvId] });
  check("removing a document reports the folder left empty", removed.data?.emptyFoldersLeft?.[0]?.folderPath === "02 Customers", removed.text);
  check("the removed document is still in the library", !!(await db.document.findUnique({ where: { id: csvId } })));

  // folder nesting: no cycles, no burying
  await full("create_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "a/b/c/d" });
  await full("create_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "w/x/y/z/q" });
  const cyc = await full("update_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "a", parentPath: "a/b/c" });
  check("a folder cannot move into its own subfolder", !cyc.ok && /own subfolders/.test(cyc.text), cyc.text);
  const deep = await full("update_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "a", parentPath: "w/x/y/z/q" });
  check("a move that would nest too deep is refused", !deep.ok && /levels deep/.test(deep.text), deep.text);
  await full("create_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "p" });
  await full("create_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "q" });
  let loops = 0;
  for (let i = 0; i < 6; i++) {
    await Promise.all([
      full("update_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "p", parentPath: "q" }),
      full("update_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "q", parentPath: "p" }),
    ]);
    const t = await full("get_dataroom", { dataroomId: room.dataroomId });
    const reachable = JSON.stringify(t.data?.contents ?? "").split('"kind":"folder"').length - 1;
    if (reachable !== t.data?.folderCount) loops++;
    await full("update_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "q/p", parentPath: "" });
    await full("update_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "p/q", parentPath: "" });
  }
  check("two opposite moves at the same moment cannot form a loop", loops === 0, `${loops} of 6 rounds orphaned folders`);

  // ---- versions ----
  const wrongKind = await full("request_version_upload", { documentId: d2.json.documentId, fileName: "customers.csv" });
  check("a new version must be the same kind of file", !wrongKind.ok && /same kind/.test(wrongKind.text), wrongKind.text);
  const ver = await full("request_version_upload", { documentId: d2.json.documentId, fileName: "deck-v2.pdf", versionNote: "updated numbers" });
  const verRes = await runUpload(ver.data.command, await pdfBytes("Investor deck v2"));
  check("upload a new version", verRes.status === 200 && verRes.json.version === 2, JSON.stringify(verRes.json));
  const edited = await full("update_text_document", { documentId: long.data.documentId, content: "# Shorter" });
  check("a text document can be rewritten", edited.data?.version === 2, edited.text);

  // ---- sharing ----
  const company = await full("create_sharing_link", { dataroomId: room.dataroomId, allowList: ["Northgate Capital"] });
  check("a company name is not accepted as an allow-list entry", !company.ok, company.text);
  const weak = await full("create_sharing_link", { dataroomId: room.dataroomId, accessMode: "EMAIL", allowList: ["@northgate.example"] });
  check("an allow list needs verified email", !weak.ok && /EMAIL_VERIFIED/.test(weak.text), weak.text);
  const link = await full("create_sharing_link", { dataroomId: room.dataroomId, allowList: ["@northgate.example"] });
  check(
    "a link defaults to verified email and no downloads, and echoes its protection",
    link.data?.accessMode === "EMAIL_VERIFIED" && link.data?.allowDownload === false && link.data?.allowList?.[0] === "@northgate.example" && link.data?.status === "active",
    link.text
  );
  const inv = await full("invite_recipients", { linkId: link.data.linkId, emails: ["anna@northgate.example", "bob@othervc.example", "not an email"] });
  check(
    "invitations skip addresses the link would turn away",
    inv.data?.sent?.length === 1 && inv.data?.notSentLinkWouldTurnThemAway?.[0]?.email === "bob@othervc.example" && inv.data?.notValidAddresses?.length === 1,
    inv.text
  );

  // organise-only key and content that is already shared
  const blockedAdd = await organise("organize_dataroom", { dataroomId: room.dataroomId, placements: [{ documentId: csvId, folderPath: "" }] });
  check("an organise key cannot add to a room that is already shared", !blockedAdd.ok && /share/.test(blockedAdd.text), blockedAdd.text);
  for (const [what, tool, args] of [
    ["move a document in", "organize_dataroom", { dataroomId: room.dataroomId, placements: [{ documentId: d1.json.documentId, folderPath: "" }] }],
    ["preview a change to", "organize_dataroom", { dataroomId: room.dataroomId, dryRun: true, placements: [{ documentId: csvId, folderPath: "" }] }],
    ["remove a document from", "remove_from_dataroom", { dataroomId: room.dataroomId, documentIds: [d1.json.documentId] }],
    ["reorder", "reorder_dataroom", { dataroomId: room.dataroomId, order: [{ documentId: d2.json.documentId }] }],
    ["add a folder to", "create_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "New" }],
    ["rename a folder in", "update_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "01 Legal", name: "Legal" }],
    ["delete a folder in", "delete_dataroom_folder", { dataroomId: room.dataroomId, folderPath: "01 Legal" }],
    ["re-describe", "update_dataroom", { dataroomId: room.dataroomId, description: "hello visitors" }],
  ] as const) {
    const res = await organise(tool, args as any);
    check(`an organise key cannot ${what} a shared room`, !res.ok && /changeWhatIsAlreadyShared/.test(res.text), res.text);
  }
  const renShared = await organise("rename_documents", { renames: [{ documentId: d1.json.documentId, name: "Renamed for visitors" }] });
  check("an organise key cannot rename a document visitors can see", !renShared.ok && /changeWhatIsAlreadyShared/.test(renShared.text), renShared.text);
  const blockedVer = await organise("request_version_upload", { documentId: d2.json.documentId, fileName: "deck-v3.pdf" });
  check("an organise key cannot replace a shared document's file", !blockedVer.ok && /share/.test(blockedVer.text), blockedVer.text);
  const blockedText = await organise("create_text_document", { name: "sneaky", content: "x", dataroomId: room.dataroomId });
  check("an organise key cannot write a document into a shared room", !blockedText.ok, blockedText.text);
  const quiet = await organise("create_dataroom", { name: "E2E quiet room" });
  const quietAdd = await organise("organize_dataroom", { dataroomId: quiet.data.dataroomId, placements: [{ documentId: csvId, folderPath: "Data" }] });
  check("an organise key can fill a room that is not shared", quietAdd.ok && quietAdd.data?.added?.length === 1, quietAdd.text);
  const visits = await full("get_sharing_link_visits", { linkId: link.data.linkId });
  check("a link lists who was invited and says who can enter", visits.data?.invited?.[0]?.email === "anna@northgate.example" && /@northgate.example/.test(visits.data?.whoCanEnter ?? ""), visits.text);
  const revoked = await full("revoke_invitations", { linkId: link.data.linkId, emails: ["anna@northgate.example"] });
  check("an invitation can be withdrawn", revoked.data?.revoked?.length === 1, revoked.text);
  const off = await full("update_sharing_link", { linkId: link.data.linkId, archived: true });
  check("a link can be switched off", off.data?.status === "archived", off.text);

  // ---- team isolation ----
  for (const [tool, args] of [
    ["get_document", { documentId: d1.json.documentId }],
    ["get_document_text", { documentId: d1.json.documentId }],
    ["get_dataroom", { dataroomId: room.dataroomId }],
    ["rename_documents", { renames: [{ documentId: d1.json.documentId, name: "x" }] }],
    ["organize_dataroom", { dataroomId: room.dataroomId, placements: [{ documentId: d1.json.documentId, folderPath: "" }] }],
    ["create_sharing_link", { documentId: d1.json.documentId }],
    ["update_sharing_link", { linkId: link.data.linkId, archived: false }],
    ["request_version_upload", { documentId: d1.json.documentId, fileName: "x.pdf" }],
    ["delete_documents", { documentIds: [d1.json.documentId] }],
    ["delete_dataroom", { dataroomId: room.dataroomId, confirmName: "E2E room" }],
  ] as const) {
    const res = await other(tool, args as any);
    check(`another team's key cannot ${tool}`, !res.ok && /^Error: No /.test(res.text) && !/E2E room|Capitalisation/.test(res.text), res.text);
  }
  const ownRoom = (await other("create_dataroom", { name: "B room" })).data;
  const cross = await other("organize_dataroom", { dataroomId: ownRoom.dataroomId, placements: [{ documentId: d1.json.documentId, folderPath: "" }] });
  check("another team's key cannot place this team's document in its own room", !cross.ok, cross.text);

  // ---- a member limited to one room ----
  await db.resourcePermission.create({
    data: { memberId: s.limitedMember.id, resourceType: "DATAROOM", resourceId: quiet.data.dataroomId, level: "VIEW" },
  });
  const limited = await connect(s.limited);
  const lws = await limited("get_workspace");
  check("a limited member's key is told it is limited", !!lws.data?.limitedTo && lws.data.counts.datarooms === 1, lws.text);
  const ldocs = await limited("list_documents");
  check("a limited member sees only documents in their room", ldocs.data?.total === 1 && ldocs.data.documents[0].documentId === csvId, ldocs.text);
  check("a limited member cannot read a document outside their room", !(await limited("get_document_text", { documentId: d1.json.documentId })).ok);
  check("a limited member cannot open another room", !(await limited("get_dataroom", { dataroomId: room.dataroomId })).ok);
  const llinks = await limited("list_sharing_links", { includeArchived: true });
  check("a limited member does not see other rooms' links", llinks.data?.total === 0, llinks.text);
  const lvis = await limited("get_sharing_link_visits", { linkId: link.data.linkId });
  check("a hidden link reads as no such link, without naming its room", !lvis.ok && /No sharing link/.test(lvis.text) && !/data room/.test(lvis.text), lvis.text);
  check("a limited member cannot browse library folders", !(await limited("list_library_folders")).ok);
  const lren = await limited("rename_documents", { renames: [{ documentId: csvId, name: "x" }] });
  check("a view-only member cannot rename a document in their room", !lren.ok, lren.text);
  const lrenOther = await limited("rename_documents", { renames: [{ documentId: d1.json.documentId, name: "x" }] });
  check("a limited member cannot rename a document outside their room", !lrenOther.ok && /^Error: No document/.test(lrenOther.text), lrenOther.text);
  const ldel = await limited("delete_documents", { documentIds: [d1.json.documentId] });
  check("a limited member cannot delete a document outside their room", !ldel.ok && !!(await db.document.findUnique({ where: { id: d1.json.documentId } })), ldel.text);
  const lorg = await limited("organize_dataroom", { dataroomId: quiet.data.dataroomId, placements: [{ documentId: csvId, folderPath: "x" }] });
  check("a view-only member cannot rearrange their room", !lorg.ok && /edit access/.test(lorg.text), lorg.text);
  // a limited member cannot widen who sees a document they can only view
  const ownRoomL = await limited("create_dataroom", { name: "E2E limited member's room" });
  const pull = await limited("organize_dataroom", { dataroomId: ownRoomL.data.dataroomId, placements: [{ documentId: csvId, folderPath: "" }] });
  check("a view-only member cannot pull a document into a room of their own", !pull.ok && /not add them to another room/.test(pull.text), pull.text);
  const lDelOwnRoom = await limited("delete_documents", { documentIds: [csvId] });
  check("a limited member cannot delete a document they did not bring in", !lDelOwnRoom.ok, lDelOwnRoom.text);
  // a version command issued while the document was theirs stops working once it is not
  const mine = await limited("create_text_document", { name: "Limited member's note", content: "v1" });
  const stale = await limited("request_version_upload", { documentId: mine.data.documentId, fileName: "note.md" });
  await full("organize_dataroom", { dataroomId: room.dataroomId, placements: [{ documentId: mine.data.documentId, folderPath: "" }] });
  const staleRes = await runUpload(stale.data.command, "v2 from a stale command");
  check("a version command stops working when the document leaves the member's reach", staleRes.status === 403, JSON.stringify(staleRes.json));

  for (const path of ["/api/v1/documents", "/api/v1/links", "/api/v1/views?limit=500"]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${s.limited}` } });
    const body = JSON.stringify(await res.json());
    check(`REST ${path.split("?")[0]} hides other rooms from a limited member`, res.status === 200 && !/Investor deck|Capitalisation|E2E room"/.test(body), body.slice(0, 300));
  }
  const neg = await fetch(`${BASE}/api/v1/views?limit=-1000000`, { headers: { Authorization: `Bearer ${s.full}` } });
  check("REST views ignores a negative limit", neg.status === 200 && ((await neg.json()) as any).views.length <= 100);
  const restWrite = await fetch(`${BASE}/api/v1/links`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s.organise}`, "content-type": "application/json" },
    body: JSON.stringify({ targetType: "DATAROOM", targetId: room.dataroomId, name: "x" }),
  });
  check("REST refuses to create a link without the share scope", restWrite.status === 403);
  const restWeak = await fetch(`${BASE}/api/v1/links`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s.full}`, "content-type": "application/json" },
    body: JSON.stringify({ targetType: "DATAROOM", targetId: room.dataroomId, name: "x", accessMode: "PUBLIC", allowList: ["@acme.com"] }),
  });
  check("REST refuses an allow list without verified email", restWeak.status === 400);
  const batch = await fetch(`${BASE}/api/mcp/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s.read}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "tools/list" }))),
  });
  check("a large batch of calls in one request is refused", batch.status === 400, String(batch.status));

  // ---- deleting ----
  const preview = await full("delete_dataroom", { dataroomId: room.dataroomId });
  check("delete without confirmation is a preview, not an error", preview.ok && preview.data?.deleted === false && preview.data?.wouldDelete?.sharingLinksDeleted === 1, preview.text);
  const wrong = await full("delete_dataroom", { dataroomId: room.dataroomId, confirmName: "E2E" });
  check("a wrong confirmation name is called out", !wrong.ok && /does not match/.test(wrong.text), wrong.text);
  const gone = await full("delete_dataroom", { dataroomId: room.dataroomId, confirmName: "E2E room" });
  check("delete with the exact name deletes", gone.data?.deleted === true && !(await db.dataroom.findUnique({ where: { id: room.dataroomId } })), gone.text);
  check("the room's documents stay in the library", !!(await db.document.findUnique({ where: { id: d1.json.documentId } })));
  const delPreview = await full("delete_documents", { documentIds: [d1.json.documentId, d2.json.documentId] });
  check("deleting documents is previewed first", delPreview.ok && delPreview.data?.deleted === false && delPreview.data?.wouldDelete?.length === 2, delPreview.text);
  const delWrong = await full("delete_documents", { documentIds: [d1.json.documentId], confirmToken: delPreview.data.confirmToken });
  check("a confirmation only covers the exact set that was previewed", !delWrong.ok && !!(await db.document.findUnique({ where: { id: d1.json.documentId } })), delWrong.text);
  const delDone = await full("delete_documents", { documentIds: [d1.json.documentId, d2.json.documentId], confirmToken: delPreview.data.confirmToken });
  check("several documents are deleted in one confirmed call", delDone.data?.deleted === true && !(await db.document.findUnique({ where: { id: d2.json.documentId } })), delDone.text);

  // ---- audit trail ----
  const changes = await full("list_recent_changes", { limit: 200 });
  check("the change list leaves out refusals unless asked", (changes.data?.changes ?? []).every((c: any) => !c.refused));
  const summaries: string[] = (changes.data?.changes ?? []).map((c: any) => c.summary);
  check("changes are recorded", summaries.some((x) => /Permanently deleted data room "E2E room"/.test(x)) && summaries.some((x) => /anna@northgate.example/.test(x)), summaries.slice(0, 3).join(" | "));
  const refusedRows = await db.apiTokenEvent.count({ where: { tokenName: "read" } });
  check("a key probing for tools it lacks leaves no audit rows", refusedRows === 0, String(refusedRows));
  check("dry runs and delete previews are not recorded as changes", !summaries.some((x) => /dry run|wouldDelete|Nothing was deleted/i.test(x)));
  const hits = await Promise.all(Array.from({ length: 330 }, () => read("get_workspace")));
  check("the rate limit stops a runaway loop", hits.some((h) => /too many calls/i.test(h.text)));

  await db.$disconnect();
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
