"use client";

import { useTracking } from "@/components/viewer/use-tracking";

/** Client wrapper that meters time and mouse activity on the index page. */
export function IndexTracker({
  viewId,
  trackToken,
  children,
  preview = false,
}: {
  viewId: string;
  trackToken: string;
  children: React.ReactNode;
  preview?: boolean;
}) {
  const { containerRef } = useTracking({
    viewId,
    token: trackToken,
    numPages: 1,
    claimSession: true,
    preview,
  });
  return <div ref={containerRef}>{children}</div>;
}
