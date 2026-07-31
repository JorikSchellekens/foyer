"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// pdf.js touches DOM globals at module scope; browser only.
export const PageHeatmapGridLazy = dynamic(
  () => import("./page-heatmap").then((m) => m.PageHeatmapGrid),
  {
    ssr: false,
    // Page-shaped skeletons in the real grid, so the arriving maps land in the
    // space already reserved for them instead of pushing the page down.
    loading: () => (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="aspect-[1/1.294] w-full border" />
            <Skeleton className="mx-auto mt-1.5 h-3 w-24" />
          </div>
        ))}
      </div>
    ),
  }
);
