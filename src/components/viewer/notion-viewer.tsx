"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { NotionRenderer } from "react-notion-x";
import type { ExtendedRecordMap } from "notion-types";
// Math (block equations and inline $...$) via KaTeX, and code blocks via
// Prism. react-notion-x renders nothing for either unless handed these.
// KaTeX renders synchronously, so equations arrive in the server HTML;
// Prism only adds highlighting after mount, so hydration still matches.
import "./prism-manual"; // must precede the prismjs import inside Code
import { Equation } from "react-notion-x/build/third-party/equation";
import { Code } from "react-notion-x/build/third-party/code";
import "react-notion-x/src/styles.css";
import "katex/dist/katex.min.css";
import "prismjs/themes/prism.css";

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

/**
 * Notion names languages in words ("Plain Text", "Objective C"), which
 * become class names with spaces. Squash them to Prism's ids, so "plain
 * text" is "plaintext" (an alias Prism knows) and the class is one token.
 */
type CodeProps = Parameters<typeof Code>[0];
function NotionCode({ block, ...rest }: CodeProps) {
  const lang = block.properties?.language?.[0]?.[0];
  const normalized =
    typeof lang === "string" ? lang.toLowerCase().replace(/\s+/g, "") : lang;
  const fixed =
    normalized === lang
      ? block
      : {
          ...block,
          properties: { ...block.properties, language: [[normalized]] },
        };
  return <Code block={fixed as typeof block} {...rest} />;
}

export function NotionViewer({
  recordMap,
}: {
  recordMap: ExtendedRecordMap;
}) {
  // Honour Notion's own "Full width" page setting: the root block is first.
  const root = Object.values(recordMap.block)[0] as
    | { value?: { format?: { page_full_width?: boolean } } }
    | undefined;
  const fullWidth = !!root?.value?.format?.page_full_width;

  return (
    <div
      // foyer-notion-frame: width and type scale with the screen (globals.css)
      className={`foyer-notion-frame mx-auto w-full px-3 py-6 sm:px-4 sm:py-8 ${
        fullWidth ? "foyer-notion-wide" : ""
      }`}
    >
      <div
        // foyer-notion: tables fill the page, type scale (see globals.css)
        className="foyer-notion reveal overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgb(0_0_0/0.45),0_18px_44px_-14px_rgb(0_0_0/0.6)]"
      >
        <NotionRenderer
          recordMap={recordMap}
          fullPage={false}
          darkMode={false}
          disableHeader
          components={{ Pdf: PdfAfterMount, Equation, Code: NotionCode }}
        />
      </div>
    </div>
  );
}
