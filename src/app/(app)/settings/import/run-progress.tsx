"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { pluralize } from "@/lib/format";
import { pauseImport, resumeImport, stepImport } from "./actions";
import type { ActiveImport } from "./types";

/**
 * Step four: the run.
 *
 * The browser drives the import. Each `stepImport` call does about twenty
 * seconds of work and returns progress, and this component loops until the
 * run reports it is finished. That keeps a long migration well inside request
 * limits without needing a job queue, and makes closing the tab a pause rather
 * than a failure - reopening this page continues from the last completed item.
 */
export function RunProgress({ record }: { record: ActiveImport }) {
  const router = useRouter();
  const [total, setTotal] = useState(record.total);
  const [done, setDone] = useState(record.done);
  const [failed, setFailed] = useState(record.failed);
  const [current, setCurrent] = useState<string | null>(record.activity);
  const [error, setError] = useState<string | null>(record.error);

  const running = record.status === "RUNNING";
  // Guards against React strict-mode double-invoke starting two loops.
  const loopActive = useRef(false);

  const loop = useCallback(async () => {
    if (loopActive.current) return;
    loopActive.current = true;
    try {
      for (;;) {
        const res = await stepImport(record.id);
        if (!res.ok) {
          setError(res.error);
          router.refresh();
          return;
        }
        setTotal(res.total);
        setDone(res.done);
        setFailed(res.failed);
        setCurrent(res.current);
        if (res.status !== "running") {
          router.refresh();
          return;
        }
      }
    } catch {
      setError("Lost contact with the server. Press resume to continue.");
    } finally {
      loopActive.current = false;
    }
  }, [record.id, router]);

  // Deferred a tick so the loop's first setState lands in its own render pass
  // rather than cascading out of the effect body.
  useEffect(() => {
    if (!running) return;
    const handle = setTimeout(() => void loop(), 0);
    return () => clearTimeout(handle);
  }, [running, loop]);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-2xl">{pct}%</span>
          <span className="font-mono text-xs text-muted-foreground tabular">
            {done} / {total}
          </span>
        </div>
        <Progress
          value={pct}
          className="mt-3"
          aria-label="Import progress"
        />
        <p className="mt-3 min-h-4 truncate text-xs text-muted-foreground">
          {running
            ? (current ?? "Working...")
            : record.status === "PAUSED"
              ? "Paused. Nothing is lost - resume when you are ready."
              : "Waiting."}
        </p>
        {failed > 0 && (
          <p className="mt-1 text-xs text-amber-600">
            {pluralize(failed, "item")} failed. You can retry them when the run
            finishes.
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        {running ? (
          <Button
            variant="secondary"
            onClick={async () => {
              await pauseImport(record.id);
              router.refresh();
            }}
          >
            <Pause className="size-4" /> Pause
          </Button>
        ) : (
          <Button
            onClick={async () => {
              setError(null);
              await resumeImport(record.id);
              router.refresh();
            }}
          >
            <Play className="size-4" /> Resume
          </Button>
        )}
        <Button variant="ghost" onClick={() => router.refresh()}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Keep this tab open while the import runs. If you close it the import
        pauses safely - come back to this page and press resume.
      </p>
    </div>
  );
}
