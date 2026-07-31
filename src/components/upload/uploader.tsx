"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  FileUp,
  FolderUp,
  Loader2,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import {
  createUploadedDocuments,
  type UploadedFile,
} from "@/app/(app)/documents/actions";

/** Per-file state, so a queue can be honest about which file is where. */
export type UploadFileState = {
  name: string;
  size: number;
  pct: number;
  status: "queued" | "uploading" | "done" | "failed";
  error?: string;
};

export type UploadProgress = {
  done: number;
  total: number;
  pct: number; // 0-100 across all bytes
  files?: UploadFileState[];
} | null;

function errorFromXhr(xhr: XMLHttpRequest): string {
  try {
    const parsed = JSON.parse(xhr.responseText) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    // non-JSON body
  }
  return `Upload failed (${xhr.status || "network error"})`;
}

/** PUT one file with byte-level progress. Rejects on any non-2xx or drop. */
function putWithProgress(
  url: string,
  file: File,
  onBytes: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream"
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onBytes(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onBytes(file.size);
        resolve();
      } else {
        reject(new Error(errorFromXhr(xhr)));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload was interrupted."));
    xhr.send(file);
  });
}

/** Warn the visitor before they close/reload the tab while `active`. */
function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}

/**
 * Upload files into object storage and return their keys, without creating
 * any Document rows. Exported (below) because callers that are not "add to
 * library" - the Papermark importer supplying files for already-planned
 * documents - need the bytes stored but must attach them themselves.
 *
 * One file failing no longer sinks the batch: every other file still lands and
 * is returned, and the failures are reported through `onFile` so the caller can
 * offer a retry for just those. Only a batch where nothing at all succeeded
 * throws, which keeps the single-file case reading as a plain failure.
 */
async function presignAndPut(
  files: { file: File; relativeDir: string }[],
  onProgress: (done: number, pct: number) => void,
  onFile?: (
    index: number,
    state: { pct: number; status: UploadFileState["status"]; error?: string }
  ) => void
): Promise<UploadedFile[]> {
  const res = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      files: files.map(({ file }) => ({
        name: file.name,
        contentType: file.type || "application/octet-stream",
      })),
    }),
  });
  if (!res.ok) throw new Error("Could not prepare the upload.");
  const { files: signed } = (await res.json()) as {
    files: { name: string; key: string; url: string }[];
  };

  const totalBytes =
    files.reduce((s, { file }) => s + file.size, 0) || 1;
  const loaded = new Array(files.length).fill(0);
  const uploaded: UploadedFile[] = [];
  const failures: string[] = [];
  let done = 0;

  const report = () => {
    const sum = loaded.reduce((s, n) => s + n, 0);
    onProgress(done, Math.min(100, Math.round((sum / totalBytes) * 100)));
  };

  let next = 0;
  const runOne = async () => {
    while (next < files.length) {
      const i = next++;
      const entry = files[i];
      const target = signed[i];
      onFile?.(i, { pct: 0, status: "uploading" });
      try {
        await putWithProgress(target.url, entry.file, (b) => {
          loaded[i] = b;
          onFile?.(i, {
            pct: Math.min(100, Math.round((b / (entry.file.size || 1)) * 100)),
            status: "uploading",
          });
          report();
        });
        uploaded.push({
          key: target.key,
          name: entry.file.name,
          size: entry.file.size,
          contentType: entry.file.type || "application/octet-stream",
          relativeDir: entry.relativeDir,
        });
        onFile?.(i, { pct: 100, status: "done" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed.";
        failures.push(message);
        // A failed file's bytes must not count towards the batch total, or the
        // overall percentage would climb past what actually landed.
        loaded[i] = 0;
        onFile?.(i, { pct: 0, status: "failed", error: message });
      }
      done++;
      report();
    }
  };

  await Promise.all(Array.from({ length: 4 }, runOne));
  if (uploaded.length === 0 && failures.length > 0) throw new Error(failures[0]);
  return uploaded;
}

export function relativeDirOf(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  if (!rel) return "";
  const parts = rel.split("/");
  parts.pop();
  return parts.join("/");
}

/** Full-screen blocking overlay shown while an upload is in flight. */
export function UploadingOverlay({ progress }: { progress: UploadProgress }) {
  // Overlay only appears after a user-initiated upload (client-side), so the
  // server and first client render both produce null - no hydration mismatch.
  if (!progress || typeof document === "undefined") return null;

  const files = progress.files ?? [];
  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-background/80 duration-[var(--dur)] ease-[var(--ease-out-soft)] supports-backdrop-filter:backdrop-blur-xs animate-in fade-in-0">
      <div
        role="status"
        aria-live="polite"
        className="mx-4 w-full max-w-md rounded-xl border bg-card p-5 shadow-[var(--shadow-overlay)] duration-[var(--dur-slow)] ease-[var(--ease-out-quint)] animate-in fade-in-0 zoom-in-95"
      >
        <div className="flex items-center gap-3">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              Uploading {progress.done}/{progress.total}
              {progress.total === 1 ? " file" : " files"}
            </p>
            <p className="text-xs text-muted-foreground">
              Keep this tab open until it finishes.
            </p>
          </div>
          <span className="ml-auto font-mono text-sm tabular">
            {progress.pct}%
          </span>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-[var(--dur)] ease-[var(--ease-out-soft)]"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
        {files.length > 1 && (
          <ul className="mt-4 max-h-56 space-y-0.5 overflow-y-auto border-t pt-3">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 py-0.5 text-xs"
              >
                <FileStatusGlyph status={f.status} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate transition-colors duration-[var(--dur)]",
                    f.status === "done" && "text-muted-foreground",
                    f.status === "failed" && "text-destructive"
                  )}
                >
                  {f.name}
                </span>
                <span className="shrink-0 font-mono tabular text-muted-foreground">
                  {f.status === "failed"
                    ? "failed"
                    : f.status === "done"
                      ? formatBytes(f.size)
                      : f.status === "uploading"
                        ? `${f.pct}%`
                        : "queued"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body
  );
}

function FileStatusGlyph({ status }: { status: UploadFileState["status"] }) {
  if (status === "done")
    return <Check className="size-3 shrink-0 text-primary" strokeWidth={2.5} />;
  if (status === "failed")
    return <X className="size-3 shrink-0 text-destructive" strokeWidth={2.5} />;
  if (status === "uploading")
    return <Loader2 className="size-3 shrink-0 animate-spin text-primary" />;
  return (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
    />
  );
}

type Pending = { file: File; relativeDir: string };

export function useUpload(folderId: string | null) {
  const router = useRouter();
  const [progress, setProgress] = useState<UploadProgress>(null);
  const [failed, setFailed] = useState<Pending[]>([]);
  useLeaveGuard(progress !== null);

  const run = useCallback(
    async (files: Pending[]) => {
      if (files.length === 0) return;
      const states: UploadFileState[] = files.map(({ file }) => ({
        name: file.name,
        size: file.size,
        pct: 0,
        status: "queued",
      }));
      const failures = new Set<number>();
      setFailed([]);
      setProgress({ done: 0, total: files.length, pct: 0, files: [...states] });
      try {
        const uploaded = await presignAndPut(
          files,
          (done, pct) =>
            setProgress({
              done,
              total: files.length,
              pct,
              files: [...states],
            }),
          (i, s) => {
            states[i] = { ...states[i], ...s };
            if (s.status === "failed") failures.add(i);
          }
        );
        if (uploaded.length > 0)
          await createUploadedDocuments(uploaded, folderId);
        if (failures.size > 0) {
          setFailed([...failures].map((i) => files[i]));
          toast.warning(
            `${failures.size} of ${files.length} files did not upload. You can retry just those.`
          );
        } else {
          toast.success(
            files.length === 1
              ? `Uploaded ${files[0].file.name}`
              : `Uploaded ${files.length} files`
          );
        }
        router.refresh();
      } catch (e) {
        setFailed(files);
        toast.error(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setProgress(null);
      }
    },
    [folderId, router]
  );

  const upload = useCallback(
    async (fileList: File[] | FileList) =>
      run(
        Array.from(fileList)
          .filter((f) => f.size > 0 && !f.name.startsWith("."))
          .map((file) => ({ file, relativeDir: relativeDirOf(file) }))
      ),
    [run]
  );

  const retry = useCallback(() => run(failed), [run, failed]);
  const dismissFailed = useCallback(() => setFailed([]), []);

  return { upload, progress, failed, retry, dismissFailed };
}

/**
 * The files from the last batch that did not land, with a retry for just
 * those. Shown inline so a part-failed drop of eighty files is recoverable
 * without re-picking the whole set.
 */
function FailedFiles({
  failed,
  retry,
  dismiss,
}: {
  failed: Pending[];
  retry: () => void;
  dismiss: () => void;
}) {
  if (failed.length === 0) return null;
  return (
    <div
      role="alert"
      className="reveal-up mt-3 w-full rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-left"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
        <p className="flex-1 text-xs font-medium">
          {failed.length === 1
            ? "1 file did not upload"
            : `${failed.length} files did not upload`}
        </p>
        <Button
          size="xs"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            retry();
          }}
        >
          <RotateCcw className="size-3" /> Retry
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Dismiss upload failures"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
        >
          <X className="size-3" />
        </Button>
      </div>
      <ul className="mt-1.5 space-y-0.5 pl-5">
        {failed.slice(0, 5).map(({ file }, i) => (
          <li
            key={`${file.name}-${i}`}
            className="truncate text-xs text-muted-foreground"
          >
            {file.name}
          </li>
        ))}
        {failed.length > 5 && (
          <li className="text-xs text-muted-foreground">
            and {failed.length - 5} more
          </li>
        )}
      </ul>
    </div>
  );
}

export function UploadButtons({ folderId }: { folderId: string | null }) {
  const { upload, progress, failed, retry, dismissFailed } =
    useUpload(folderId);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        // @ts-expect-error non-standard folder upload attribute
        webkitdirectory=""
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      <Button
        variant="outline"
        onClick={() => folderInput.current?.click()}
        disabled={!!progress}
      >
        <FolderUp className="size-4" /> Upload folder
      </Button>
      <Button onClick={() => fileInput.current?.click()} disabled={!!progress}>
        {progress ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span className="tabular">{progress.pct}%</span>
          </>
        ) : (
          <>
            <FileUp className="size-4" /> Upload files
          </>
        )}
      </Button>
      {failed.length > 0 && (
        <Button variant="outline" onClick={retry}>
          <RotateCcw className="size-4" /> Retry {failed.length} failed
        </Button>
      )}
      {failed.length > 0 && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss upload failures"
          onClick={dismissFailed}
        >
          <X className="size-3.5" />
        </Button>
      )}
      <UploadingOverlay progress={progress} />
    </>
  );
}

/**
 * Track drag depth rather than reacting to every dragleave: children of the
 * drop zone fire leave events as the pointer crosses them, and a naive handler
 * makes the accent boundary flicker on and off.
 */
function useDropState() {
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  return {
    over,
    enter: () => {
      depth.current += 1;
      setOver(true);
    },
    leave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    reset: () => {
      depth.current = 0;
      setOver(false);
    },
  };
}

/** Full-width drop target used on empty states and as a page drop layer. */
export function DropZone({
  folderId,
  className,
}: {
  folderId: string | null;
  className?: string;
}) {
  const { upload, progress, failed, retry, dismissFailed } =
    useUpload(folderId);
  const drop = useDropState();
  const fileInput = useRef<HTMLInputElement>(null);
  const choose = () => fileInput.current?.click();

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        drop.enter();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={drop.leave}
      onDrop={async (e) => {
        e.preventDefault();
        drop.reset();
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
      onClick={choose}
      aria-busy={!!progress}
      className={cn(
        // The dashed boundary is a second, inset ring that fades in on drag,
        // so arriving over the zone reads as a change of state, not a flash.
        "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-8 py-16 text-center transition-[background-color,border-color] duration-[var(--dur)] ease-[var(--ease-out-soft)]",
        drop.over
          ? "border-primary bg-accent/70"
          : "hover:border-input hover:bg-muted/50",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-1.5 rounded-md border-2 border-dashed border-primary/60 transition-opacity duration-[var(--dur)] ease-[var(--ease-out-soft)]",
          drop.over ? "opacity-100" : "opacity-0"
        )}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      {progress ? (
        <>
          <Loader2 className="mb-3 size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Uploading {progress.done} of {progress.total}…{" "}
            <span className="font-mono tabular">{progress.pct}%</span>
          </p>
        </>
      ) : (
        <>
          <UploadCloud
            className={cn(
              "mb-3 size-7 transition-[color,transform] duration-[var(--dur)] ease-[var(--ease-out-quint)]",
              drop.over
                ? "-translate-y-0.5 text-primary"
                : "text-muted-foreground/70"
            )}
            strokeWidth={1.25}
          />
          <p className="font-medium">
            {drop.over ? "Drop to upload" : "Drop files here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            PDFs, images, video, Word, spreadsheets and more.
          </p>
          {/* A real button rather than a clickable region, so the zone is
              reachable by keyboard without nesting controls in one. */}
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={(e) => {
              e.stopPropagation();
              choose();
            }}
          >
            <FileUp className="size-3.5" /> Choose files
          </Button>
        </>
      )}
      <FailedFiles failed={failed} retry={retry} dismiss={dismissFailed} />
      <UploadingOverlay progress={progress} />
    </div>
  );
}

export { putWithProgress, useLeaveGuard, presignAndPut };
