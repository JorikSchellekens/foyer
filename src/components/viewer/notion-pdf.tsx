"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

// The same self-hosted worker as the main PDF viewer. react-notion-x's own
// Pdf component would load it from unpkg instead.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * A PDF embedded in a Notion page. react-notion-x renders nothing for these
 * unless it is handed a Pdf component; this is ours. `file` is Notion's
 * signed file.notion.so URL, which allows cross-origin reads.
 *
 * Pages stack at the block's width. react-notion-x gives the block its own
 * scroll box when the author set a height in Notion, as Notion does.
 */
export function NotionPdf({ file }: { file: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (failed) {
    return (
      <p className="py-6 text-center text-sm text-neutral-500">
        This PDF could not be loaded.
      </p>
    );
  }

  return (
    <div ref={boxRef} className="w-full">
      {width > 0 && (
        <Document
          file={file}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={() => setFailed(true)}
          loading={
            <div className="shimmer h-64 w-full rounded bg-white" aria-hidden />
          }
          className="flex flex-col items-center gap-3"
        >
          {Array.from({ length: numPages }, (_, i) => (
            <Page
              key={i}
              pageNumber={i + 1}
              width={width}
              renderAnnotationLayer={false}
              loading=""
              className="shadow-[0_1px_2px_rgb(0_0_0/0.25)]"
            />
          ))}
        </Document>
      )}
    </div>
  );
}
