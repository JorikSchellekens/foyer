import "server-only";
import type { Document, DocumentType } from "@prisma/client";
import { docTypeFromName } from "@/lib/doc-types";
import { getObjectBuffer } from "@/lib/storage";
import { generateVersionThumbnails } from "@/lib/thumbnails";
import { ToolError } from "./context";
import { nextOrder, type Tx } from "./tree";

export async function countPdfPages(buf: Buffer): Promise<number | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

/** A library document backed by a stored file, with its first version. */
export async function createFileDocument(
  tx: Tx,
  input: {
    teamId: string;
    userId: string;
    key: string;
    fileName: string;
    name: string;
    size: number;
    contentType: string;
    numPages: number | null;
    folderId: string | null;
  }
): Promise<Document> {
  const type = docTypeFromName(input.fileName);
  const doc = await tx.document.create({
    data: {
      teamId: input.teamId,
      folderId: input.folderId,
      name: input.name,
      type,
      versions: {
        create: {
          versionNumber: 1,
          fileKey: input.key,
          fileName: input.fileName,
          fileSize: input.size,
          contentType: input.contentType,
          numPages: input.numPages,
          uploadedById: input.userId,
        },
      },
    },
    include: { versions: true },
  });
  return tx.document.update({
    where: { id: doc.id },
    data: { currentVersionId: doc.versions[0].id },
  });
}

/** A link or Notion document: a library entry that is only a URL. */
export async function createExternalDocument(
  tx: Tx,
  input: {
    teamId: string;
    userId: string;
    kind: "LINK" | "NOTION";
    url: string;
    name: string;
    folderId: string | null;
  }
): Promise<Document> {
  const doc = await tx.document.create({
    data: {
      teamId: input.teamId,
      folderId: input.folderId,
      name: input.name,
      type: input.kind,
      externalUrl: input.url,
      versions: {
        create: {
          versionNumber: 1,
          fileName: input.kind === "LINK" ? "link" : "notion",
          contentType: input.kind === "LINK" ? "text/uri-list" : "text/html",
          uploadedById: input.userId,
        },
      },
    },
    include: { versions: true },
  });
  return tx.document.update({
    where: { id: doc.id },
    data: { currentVersionId: doc.versions[0].id },
  });
}

/** Put a document in a room folder, or move it there if already in the room. */
export async function placeInRoom(
  tx: Tx,
  dataroomId: string,
  documentId: string,
  folderId: string | null,
  order?: { next: number }
): Promise<"added" | "moved" | "unchanged"> {
  const existing = await tx.dataroomDocument.findUnique({
    where: { dataroomId_documentId: { dataroomId, documentId } },
  });
  if (existing) {
    if (existing.folderId === folderId) return "unchanged";
    const o = order ?? { next: await nextOrder(tx, dataroomId) };
    await tx.dataroomDocument.update({
      where: { id: existing.id },
      data: { folderId, orderIndex: o.next++ },
    });
    return "moved";
  }
  const o = order ?? { next: await nextOrder(tx, dataroomId) };
  await tx.dataroomDocument.create({
    data: { dataroomId, documentId, folderId, orderIndex: o.next++ },
  });
  return "added";
}

export function warmThumbnails(type: DocumentType, versionId: string | null) {
  if (type === "PDF" && versionId)
    void generateVersionThumbnails(versionId).catch(() => {});
}

// ---------- reading text ----------

const MAX_PDF_BYTES = 60 * 1024 * 1024;
// Word and Excel files are zip archives that are unpacked whole in memory;
// a small file can expand enormously, so these are held to a low ceiling.
const MAX_OFFICE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES = 20 * 1024 * 1024;

export type Extracted = {
  text: string;
  truncated: boolean;
  /** PDFs: which pages the text covers. */
  pages?: { from: number; to: number; total: number };
  /** PDFs: where to continue. */
  nextStartPage?: number;
  /** Word, text and sheets: where to continue. */
  nextStartChar?: number;
  note?: string;
};

/**
 * Plain text of a document, for an assistant deciding what a file is and
 * where it belongs. PDFs are read page by page. Text files, Word documents
 * and spreadsheets are turned into one run of text and read by character
 * offset.
 */
export async function extractText(
  doc: { id: string; name: string; type: DocumentType; externalUrl: string | null },
  version: { fileKey: string | null; fileName: string; fileSize: number } | null,
  opts: { startPage: number; startChar: number; maxChars: number }
): Promise<Extracted> {
  if (doc.type === "LINK" || doc.type === "NOTION")
    return {
      text: "",
      truncated: false,
      note: `This is a ${doc.type === "LINK" ? "link" : "Notion page"} at ${doc.externalUrl}. Foyer does not store its text.`,
    };
  if (!["PDF", "TEXT", "DOCX", "SHEET"].includes(doc.type))
    return {
      text: "",
      truncated: false,
      note: `"${doc.name}" is ${doc.type === "IMAGE" ? "an image" : doc.type === "OTHER" ? "a file type Foyer cannot read" : `${doc.type.toLowerCase()}`}, which has no text to read. Name and file it from its file name, or ask the user what it is.`,
    };
  if (!version?.fileKey)
    throw new ToolError(`"${doc.name}" has no stored file to read.`);
  const limit =
    doc.type === "PDF"
      ? MAX_PDF_BYTES
      : doc.type === "TEXT"
        ? MAX_TEXT_FILE_BYTES
        : MAX_OFFICE_BYTES;
  if (version.fileSize > limit)
    return {
      text: "",
      truncated: false,
      note: `"${doc.name}" is too large to read text from (${Math.round(version.fileSize / 1e6)} MB; the limit for this kind of file is ${Math.round(limit / 1e6)} MB). Name and file it from its file name, or ask the user what it is.`,
    };

  const buf = await getObjectBuffer(version.fileKey);

  if (doc.type !== "PDF") {
    let all: string;
    if (doc.type === "TEXT" || /\.csv$/i.test(version.fileName)) {
      all = buf.toString("utf8");
    } else if (doc.type === "DOCX") {
      try {
        const mammoth = await import("mammoth");
        all = (await mammoth.extractRawText({ buffer: buf })).value;
      } catch {
        throw new ToolError(`"${doc.name}" could not be read as a Word document.`);
      }
    } else {
      try {
        const XLSX = await import("xlsx");
        const book = XLSX.read(buf, { type: "buffer", sheetRows: 200 });
        all = book.SheetNames.slice(0, 10)
          .map((n) => `--- sheet ${n} ---\n${XLSX.utils.sheet_to_csv(book.Sheets[n])}`)
          .join("\n\n");
      } catch {
        throw new ToolError(`"${doc.name}" could not be read as a spreadsheet.`);
      }
    }
    all = all.replace(/\r\n?/g, "\n");
    if (opts.startChar > all.length && all.length > 0)
      throw new ToolError(
        `"${doc.name}" has ${all.length} characters of text; startChar ${opts.startChar} is past the end.`
      );
    const end = opts.startChar + opts.maxChars;
    return {
      text: all.slice(opts.startChar, end),
      truncated: end < all.length,
      ...(end < all.length ? { nextStartChar: end } : {}),
      ...(doc.type === "SHEET" && !/\.csv$/i.test(version.fileName)
        ? { note: "Up to the first 200 rows of the first 10 sheets." }
        : {}),
    };
  }

  const { PDFiumLibrary } = await import("@hyzyla/pdfium");
  const library = await PDFiumLibrary.init();
  try {
    let pdf;
    try {
      pdf = await library.loadDocument(buf);
    } catch {
      throw new ToolError(
        `"${doc.name}" could not be opened as a PDF. It may be damaged or password-protected.`
      );
    }
    try {
      const total = pdf.getPageCount();
      if (opts.startPage > total)
        throw new ToolError(
          `"${doc.name}" has ${total} page${total === 1 ? "" : "s"}; startPage ${opts.startPage} is past the end.`
        );
      let text = "";
      let last = opts.startPage - 1;
      let cut: number | null = null;
      let any = false;
      for (let page = opts.startPage; page <= total; page++) {
        const pageText = pdf.getPage(page - 1).getText().replace(/\r\n?/g, "\n").trim();
        if (pageText) any = true;
        const block = `--- page ${page} ---\n${pageText}\n\n`;
        if (text.length + block.length > opts.maxChars) {
          // A page that does not fit on its own is returned cut, so a long
          // page can never stall the reader on the same page forever.
          if (text.length === 0) {
            text = block.slice(0, opts.maxChars);
            last = page;
            cut = page;
          }
          break;
        }
        text += block;
        last = page;
      }
      const more = last < total;
      return {
        text,
        pages: { from: opts.startPage, to: last, total },
        truncated: more || cut !== null,
        ...(more ? { nextStartPage: last + 1 } : {}),
        ...(cut !== null
          ? {
              note: `Page ${cut} is longer than maxChars and was cut. To read the rest of it, call again with startPage ${cut} and a larger maxChars (up to 60000).`,
            }
          : !any
            ? { note: "No text was found on these pages. They are probably scanned images." }
            : {}),
      };
    } finally {
      pdf.destroy();
    }
  } finally {
    library.destroy();
  }
}

/** Light check that the bytes match what the file name claims. */
export function sniffMismatch(fileName: string, head: Buffer): string | null {
  const type = docTypeFromName(fileName);
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((b, i) => head[offset + i] === b);
  const looksHtml = /^\s*(<!doctype html|<html)/i.test(
    head.subarray(0, 256).toString("latin1")
  );
  if (type === "PDF") {
    if (!head.subarray(0, 1024).includes("%PDF-"))
      return looksHtml
        ? "The file is named .pdf but contains a web page, which usually means a download returned an error or login page instead of the PDF."
        : "The file is named .pdf but is not a PDF.";
  }
  if (type === "DOCX" || (type === "SHEET" && /\.xlsx$/i.test(fileName))) {
    // Modern Office files are zip archives; legacy .doc/.xls are OLE files.
    const zip = startsWith([0x50, 0x4b]);
    const ole = startsWith([0xd0, 0xcf, 0x11, 0xe0]);
    if (!zip && !ole)
      return looksHtml
        ? "The file has an Office extension but contains a web page, which usually means a download returned an error or login page."
        : "The file has an Office extension but is not an Office document.";
  }
  return null;
}
