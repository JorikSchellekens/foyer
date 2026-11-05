"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { NotionRenderer } from "react-notion-x";
import type { ExtendedRecordMap } from "notion-types";
import "react-notion-x/src/styles.css";

// pdf.js touches DOMMatrix at import time, so it must never load on the
// server: client-only, and only fetched for pages that embed a PDF.
const NotionPdf = dynamic(
  () => import("./notion-pdf").then((m) => m.NotionPdf),
  { ssr: false }
);

/**
 * react-notion-x renders PDF blocks only in the browser (its isServer check),
 * so the server HTML has an empty slot there. Render nothing on the first
 * client pass too, then the PDF, so hydration matches instead of React
 * throwing the server tree away.
 */
const noSubscribe = () => () => {};
function PdfAfterMount(props: { file: string }) {
  // false while hydrating (server snapshot), true on every render after
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  return mounted ? <NotionPdf {...props} /> : null;
}

export function NotionViewer({
  recordMap,
}: {
  recordMap: ExtendedRecordMap;
}) {
  return (
    <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4 sm:py-8">
      <div
        // foyer-notion: tables fill the page (see globals.css)
        className="foyer-notion reveal overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgb(0_0_0/0.45),0_18px_44px_-14px_rgb(0_0_0/0.6)]"
      >
        <NotionRenderer
          recordMap={recordMap}
          fullPage={false}
          darkMode={false}
          disableHeader
          components={{ Pdf: PdfAfterMount }}
        />
      </div>
    </div>
  );
}
