"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Download link to a CSV export endpoint, styled as an outline button.
 *
 * A download navigation fires no completion event, so the working state is a
 * fixed acknowledgement window rather than real progress: enough to show the
 * click landed. The label never changes, so the toolbar does not reflow.
 */
export function ExportButton({
  href,
  label = "Export CSV",
}: {
  href: string;
  label?: string;
}) {
  const [working, setWorking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (
    <Button variant="outline" size="sm" asChild>
      <a
        href={href}
        download
        onClick={() => {
          setWorking(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setWorking(false), 2200);
        }}
      >
        {working ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        {label}
        <span role="status" aria-live="polite" className="sr-only">
          {working ? "Preparing export" : ""}
        </span>
      </a>
    </Button>
  );
}
