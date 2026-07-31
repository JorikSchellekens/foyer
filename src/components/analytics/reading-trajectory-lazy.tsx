"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// pdf.js touches DOM globals at module scope; browser only.
export const ReadingTrajectoryLazy = dynamic(
  () => import("./reading-trajectory").then((m) => m.ReadingTrajectory),
  {
    ssr: false,
    // Rail-plus-rows skeleton at roughly the height the real plot takes, so the
    // section below it does not move when the trajectory arrives.
    loading: () => (
      <div aria-busy className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-11 w-8 shrink-0 rounded-sm border" />
            <Skeleton
              className="h-2 rounded-full"
              style={{ width: `${[62, 34, 78, 45][i]}%` }}
            />
          </div>
        ))}
      </div>
    ),
  }
);
