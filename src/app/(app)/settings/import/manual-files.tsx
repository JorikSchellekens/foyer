"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, FolderUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { presignAndPut, relativeDirOf } from "@/components/upload/uploader";
import { pluralize } from "@/lib/format";
import { attachManualFiles, retryFailedItems } from "./actions";

/**
 * The manual file-transfer panel.
 *
 * Shown when the user chose to supply files themselves. They download from
 * Papermark (a dataroom bulk-download, or individual files) and drop the lot
 * here; files are stored and matched to the already-scanned documents by name,
 * ignoring extensions and case. Anything still unmatched is listed by name so
 * the gap is visible rather than showing up later as a row of failures.
 */
export function ManualFiles({
  importId,
  pendingDocuments,
}: {
  importId: string;
  /** Documents that still have no file attached. */
  pendingDocuments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ pct: number; done: number; total: number } | null>(
    null
  );
  const [stillMissing, setStillMissing] = useState<string[] | null>(null);

  async function handle(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list)
      .filter((f) => f.size > 0 && !f.name.startsWith("."))
      .map((file) => ({ file, relativeDir: relativeDirOf(file) }));
    if (files.length === 0) return;

    setProgress({ pct: 0, done: 0, total: files.length });
    try {
      const uploaded = await presignAndPut(files, (done, pct) =>
        setProgress({ pct, done, total: files.length })
      );
      const res = await attachManualFiles(importId, uploaded);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setStillMissing(res.unmatchedDocuments.map((d) => d.name));
      if (res.matched > 0) {
        toast.success(`Matched ${pluralize(res.matched, "file")}.`);
        // Documents that failed for want of a file can now succeed.
        await retryFailedItems(importId);
      } else {
        toast.warning("None of those files matched a document.");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  const missing = stillMissing ?? pendingDocuments.map((d) => d.name);

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <FileUp className="size-4" /> Supply the files
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Download your documents from Papermark, then drop them here. Names are
        matched automatically - extensions and capitalisation do not have to
        agree. You can do this in several goes.
      </p>

      {progress ? (
        <div className="mt-4" role="status" aria-live="polite">
          <Progress value={progress.pct} aria-label="Upload progress" />
          <p className="mt-2 font-mono text-xs text-muted-foreground tabular">
            Uploading {progress.done}/{progress.total} - {progress.pct}%
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInput.current?.click()}
          >
            <FileUp className="size-4" /> Choose files
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => folderInput.current?.click()}
          >
            <FolderUp className="size-4" /> Choose a folder
          </Button>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        // Directory picking is a non-standard attribute pair; React needs them
        // spread rather than written as JSX props.
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = "";
        }}
      />

      {missing.length > 0 && (
        <div className="mt-4 rounded-md bg-muted/50 p-3">
          <p className="text-xs font-medium">
            {pluralize(missing.length, "document")} still waiting for a file
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {missing.slice(0, 12).map((name) => (
              <li key={name} className="truncate text-xs text-muted-foreground">
                {name}
              </li>
            ))}
          </ul>
          {missing.length > 12 && (
            <p className="mt-1 text-xs text-muted-foreground">
              and {missing.length - 12} more
            </p>
          )}
        </div>
      )}

      {missing.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Every document has a file. Nothing else is needed here.
        </p>
      )}
    </section>
  );
}
