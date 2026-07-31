"use client";

import { useEffect, useState } from "react";
import { FileWarning } from "lucide-react";
import { DocumentLoading } from "./document-loading";

/** Paper on a dark desk. The elevation tokens are tuned for light surfaces,
 * so the viewer's own chrome needs a shadow with enough weight to read. */
const sheetShadow =
  "shadow-[0_1px_2px_rgb(0_0_0/0.45),0_18px_44px_-14px_rgb(0_0_0/0.6)]";

export function ImageViewer({ fileUrl, name }: { fileUrl: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative flex min-h-full items-center justify-center p-4 sm:p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-track-page
        src={fileUrl}
        alt={name}
        onLoad={() => setLoaded(true)}
        className={`max-h-[85vh] max-w-full rounded transition-opacity duration-[var(--dur-slow)] ease-[var(--ease-out-soft)] ${sheetShadow} ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        draggable={false}
      />
      {!loaded && (
        <div className="absolute inset-0">
          <DocumentLoading label="Loading image…" />
        </div>
      )}
    </div>
  );
}

export function VideoViewer({
  fileUrl,
  allowDownload,
}: {
  fileUrl: string;
  allowDownload: boolean;
}) {
  return (
    <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
      <video
        src={fileUrl}
        controls
        controlsList={allowDownload ? undefined : "nodownload"}
        playsInline
        className={`max-h-[85vh] max-w-full rounded bg-black ${sheetShadow}`}
      />
    </div>
  );
}

export function AudioViewer({ fileUrl, name }: { fileUrl: string; name: string }) {
  return (
    <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
      <div className="reveal-up w-full max-w-lg rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <p className="mb-6 font-display text-2xl italic text-white/90">{name}</p>
        <audio src={fileUrl} controls className="w-full" />
      </div>
    </div>
  );
}

export function TextViewer({ fileUrl }: { fileUrl: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(fileUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => setContent(t.slice(0, 500_000)))
      .catch(() => setError(true));
  }, [fileUrl]);

  if (error)
    return <Message text="This document could not be displayed." />;
  if (content === null) return <DocumentLoading label="Loading text…" />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <pre
        data-track-page
        className={`reveal overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-white p-6 font-mono text-[13px] leading-relaxed text-neutral-900 sm:p-8 ${sheetShadow}`}
      >
        {content}
      </pre>
    </div>
  );
}

export function DocxViewer({ fileUrl }: { fileUrl: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error();
        const buf = await res.arrayBuffer();
        const mammoth = (await import("mammoth/mammoth.browser")) as {
          convertToHtml: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
        };
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        setHtml(result.value);
      } catch {
        setError(true);
      }
    })();
  }, [fileUrl]);

  if (error) return <Message text="This document could not be converted for preview. Try downloading it instead." />;
  if (html === null) return <DocumentLoading label="Converting document…" />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <article
        data-track-page
        className={`prose-docx reveal rounded-lg bg-white p-6 text-neutral-900 sm:p-10 ${sheetShadow}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style jsx global>{`
        .prose-docx {
          font-family: Georgia, serif;
          line-height: 1.65;
          font-size: 15px;
        }
        .prose-docx h1, .prose-docx h2, .prose-docx h3 {
          margin: 1.2em 0 0.5em;
          line-height: 1.25;
        }
        .prose-docx h1 { font-size: 1.7em; }
        .prose-docx h2 { font-size: 1.35em; }
        .prose-docx p { margin: 0.6em 0; }
        .prose-docx table { border-collapse: collapse; margin: 1em 0; }
        .prose-docx td, .prose-docx th { border: 1px solid #ddd; padding: 5px 9px; }
        .prose-docx img { max-width: 100%; }
        .prose-docx ul, .prose-docx ol { padding-left: 1.4em; margin: 0.6em 0; }
      `}</style>
    </div>
  );
}

type SheetData = { name: string; rows: (string | number)[][] }[];

export function SheetViewer({ fileUrl }: { fileUrl: string }) {
  const [sheets, setSheets] = useState<SheetData | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error();
        const buf = await res.arrayBuffer();
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array" });
        const data: SheetData = wb.SheetNames.map((name) => ({
          name,
          rows: (
            XLSX.utils.sheet_to_json(wb.Sheets[name], {
              header: 1,
              defval: "",
            }) as (string | number)[][]
          ).slice(0, 1000),
        }));
        setSheets(data);
      } catch {
        setError(true);
      }
    })();
  }, [fileUrl]);

  if (error) return <Message text="This spreadsheet could not be displayed." />;
  if (sheets === null) return <DocumentLoading label="Reading spreadsheet…" />;

  const sheet = sheets[active];
  const colCount = Math.max(...sheet.rows.map((r) => r.length), 1);

  return (
    <div className="flex h-full flex-col px-4 py-4 sm:px-6 sm:py-6">
      {sheets.length > 1 && (
        <div
          role="tablist"
          aria-label="Sheets"
          className="mb-3 flex gap-1 overflow-x-auto pb-0.5"
        >
          {sheets.map((s, i) => (
            <button
              key={s.name}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] focus-visible:ring-2 focus-visible:ring-white/50 ${
                i === active
                  ? "bg-white text-neutral-900"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div
        data-track-page
        className={`reveal flex-1 overflow-auto overscroll-contain rounded-lg bg-white ${sheetShadow}`}
      >
        <table className="min-w-full border-collapse font-mono text-xs text-neutral-900">
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr
                key={ri}
                className={
                  ri === 0
                    ? "bg-neutral-100 font-semibold"
                    : ri % 2
                      ? "bg-neutral-50/60"
                      : ""
                }
              >
                <td className="sticky left-0 border border-neutral-200 bg-neutral-100 px-2 py-1 text-right text-[10px] tabular text-neutral-400">
                  {ri + 1}
                </td>
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td
                    key={ci}
                    className="max-w-64 truncate border border-neutral-200 px-2.5 py-1"
                  >
                    {String(row[ci] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div className="flex size-full min-h-72 items-center justify-center p-8">
      <div className="reveal max-w-xs text-center">
        <FileWarning
          className="mx-auto size-7 text-white/25"
          strokeWidth={1.25}
        />
        <p className="mt-3 text-sm leading-relaxed text-white/55">{text}</p>
      </div>
    </div>
  );
}
