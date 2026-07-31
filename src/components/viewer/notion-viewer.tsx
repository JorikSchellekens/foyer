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
    <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4 sm:py-8">
      <div
        className="reveal overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgb(0_0_0/0.45),0_18px_44px_-14px_rgb(0_0_0/0.6)]"
      >
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
