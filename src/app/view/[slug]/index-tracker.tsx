"use client";

import { useTracking } from "@/components/viewer/use-tracking";

/** Client wrapper that meters time and mouse activity on the index page. */
export function IndexTracker({
  viewId,
  trackToken,
  children,
}: {
  viewId: string;
  trackToken: string;
  children: React.ReactNode;
}) {
  const { containerRef } = useTracking({
    viewId,
    token: trackToken,
    numPages: 1,
    claimSession: true,
  });
  return <div ref={containerRef}>{children}</div>;
}
