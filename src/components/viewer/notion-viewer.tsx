"use client";

import { NotionRenderer } from "react-notion-x";
import type { ExtendedRecordMap } from "notion-types";
import "react-notion-x/src/styles.css";

export function NotionViewer({
  recordMap,
}: {
  recordMap: ExtendedRecordMap;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="overflow-hidden rounded-lg bg-white shadow-2xl">
        <NotionRenderer
          recordMap={recordMap}
          fullPage={false}
          darkMode={false}
          disableHeader
        />
      </div>
    </div>
  );
}
