"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, FolderUp, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createUploadedDocuments,
  type UploadedFile,
} from "@/app/(app)/documents/actions";

export type UploadProgress = {
  done: number;
  total: number;
  pct: number; // 0-100 across all bytes
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

async function presignAndPut(
  files: { file: File; relativeDir: string }[],
  onProgress: (done: number, pct: number) => void
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
      await putWithProgress(target.url, entry.file, (b) => {
        loaded[i] = b;
        report();
      });
      uploaded.push({
        key: target.key,
        name: entry.file.name,
        size: entry.file.size,
        contentType: entry.file.type || "application/octet-stream",
        relativeDir: entry.relativeDir,
      });
      done++;
      report();
    }
  };

  await Promise.all(Array.from({ length: 4 }, runOne));
  return uploaded;
}

function relativeDirOf(file: File): string {
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
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
            className="h-full rounded-full bg-primary transition-all duration-200"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function useUpload(folderId: string | null) {
  const router = useRouter();
  const [progress, setProgress] = useState<UploadProgress>(null);
  useLeaveGuard(progress !== null);

  const upload = useCallback(
    async (fileList: File[] | FileList) => {
      const files = Array.from(fileList)
        .filter((f) => f.size > 0 && !f.name.startsWith("."))
        .map((file) => ({ file, relativeDir: relativeDirOf(file) }));
      if (files.length === 0) return;
      setProgress({ done: 0, total: files.length, pct: 0 });
      try {
        const uploaded = await presignAndPut(files, (done, pct) =>
          setProgress({ done, total: files.length, pct })
        );
        await createUploadedDocuments(uploaded, folderId);
        toast.success(
          files.length === 1
            ? `Uploaded ${files[0].file.name}`
            : `Uploaded ${files.length} files`
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setProgress(null);
      }
    },
    [folderId, router]
  );

  return { upload, progress };
}

export function UploadButtons({ folderId }: { folderId: string | null }) {
  const { upload, progress } = useUpload(folderId);
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
            {progress.pct}%
          </>
        ) : (
          <>
            <FileUp className="size-4" /> Upload files
          </>
        )}
      </Button>
      <UploadingOverlay progress={progress} />
    </>
  );
}

/** Full-width drop target used on empty states and as a page drop layer. */
export function DropZone({
  folderId,
  className,
}: {
  folderId: string | null;
  className?: string;
}) {
  const { upload, progress } = useUpload(folderId);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
      onClick={() => fileInput.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-8 py-16 text-center transition-colors",
        over ? "border-primary bg-accent" : "hover:bg-muted/50",
        className
      )}
    >
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
            Uploading {progress.done} of {progress.total}… {progress.pct}%
          </p>
        </>
      ) : (
        <>
          <UploadCloud
            className="mb-3 size-7 text-muted-foreground/70"
            strokeWidth={1.25}
          />
          <p className="font-medium">Drop files here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            or click to choose. PDFs, images, video, Word, spreadsheets and
            more.
          </p>
        </>
      )}
      <UploadingOverlay progress={progress} />
    </div>
  );
}

export { putWithProgress, useLeaveGuard };
