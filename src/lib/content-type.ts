/**
 * The content type a stored file is served with, decided by its extension and
 * nothing else.
 *
 * The type a browser or an API client declares at upload time is not trusted:
 * files are served from the app's own origin, so a file stored as text/html
 * would run script with a signed-in member's session. Anything that a browser
 * could execute is served as plain text or as a download instead.
 */
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  // Scriptable when opened directly; safe in <img>, and the sandbox header on
  // file responses stops script if someone navigates to it.
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv; charset=utf-8",
  zip: "application/zip",
};

const PLAIN = "text/plain; charset=utf-8";
const TEXT_EXT = new Set(["txt", "md", "json", "ts", "tsx", "js", "py", "html", "htm", "css", "xml", "yml", "yaml", "log"]);

export function contentTypeForFile(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (TEXT_EXT.has(ext)) return PLAIN;
  return TYPES[ext] ?? "application/octet-stream";
}
