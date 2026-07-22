"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// pdf.js touches DOM globals at module scope; browser only.
export const ReadingTrajectoryLazy = dynamic(
  () => import("./reading-trajectory").then((m) => m.ReadingTrajectory),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading trajectory&hellip;
      </div>
    ),
  }
);
