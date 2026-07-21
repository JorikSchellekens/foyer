"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// pdf.js touches DOM globals at module scope; browser only.
export const PageHeatmapGridLazy = dynamic(
  () => import("./page-heatmap").then((m) => m.PageHeatmapGrid),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Rendering pages…
      </div>
    ),
  }
);
