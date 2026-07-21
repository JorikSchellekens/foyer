import type { DocumentType } from "@prisma/client";

const EXT_MAP: Record<string, DocumentType> = {
  pdf: "PDF",
  png: "IMAGE",
  jpg: "IMAGE",
  jpeg: "IMAGE",
  gif: "IMAGE",
  webp: "IMAGE",
  svg: "IMAGE",
  avif: "IMAGE",
  mp4: "VIDEO",
  webm: "VIDEO",
  mov: "VIDEO",
  mp3: "AUDIO",
  wav: "AUDIO",
  m4a: "AUDIO",
  ogg: "AUDIO",
  docx: "DOCX",
  doc: "DOCX",
  xlsx: "SHEET",
  xls: "SHEET",
  csv: "SHEET",
  txt: "TEXT",
  md: "TEXT",
  json: "TEXT",
  ts: "TEXT",
  tsx: "TEXT",
  js: "TEXT",
  py: "TEXT",
  html: "TEXT",
  css: "TEXT",
};

export function docTypeFromName(fileName: string): DocumentType {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "OTHER";
}

export function docTypeLabel(type: DocumentType): string {
  switch (type) {
    case "PDF":
      return "PDF";
    case "IMAGE":
      return "Image";
    case "VIDEO":
      return "Video";
    case "AUDIO":
      return "Audio";
    case "DOCX":
      return "Word";
    case "SHEET":
      return "Spreadsheet";
    case "TEXT":
      return "Text";
    case "NOTION":
      return "Notion";
    default:
      return "File";
  }
}

export function isPreviewable(type: DocumentType): boolean {
  return type !== "OTHER";
}
