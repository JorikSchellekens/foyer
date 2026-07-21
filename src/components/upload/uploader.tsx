"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, FolderUp, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createUploadedDocuments,
  type UploadedFile,
} from "@/app/(app)/documents/actions";

type Progress = { done: number; total: number } | null;

async function presignAndPut(
  files: { file: File; relativeDir: string }[],
  onProgress: (done: number) => void
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

  const uploaded: UploadedFile[] = [];
  let done = 0;
  const queue = files.map((entry, i) => async () => {
    const target = signed[i];
    const put = await fetch(target.url, {
      method: "PUT",
      headers: {
        "content-type": entry.file.type || "application/octet-stream",
      },
      body: entry.file,
    });
    if (!put.ok) throw new Error(`Upload failed for ${entry.file.name}`);
    uploaded.push({
      key: target.key,
      name: entry.file.name,
      size: entry.file.size,
      contentType: entry.file.type || "application/octet-stream",
      relativeDir: entry.relativeDir,
    });
    onProgress(++done);
  });

  // 4 concurrent uploads
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) await queue.shift()!();
  });
  await Promise.all(workers);
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

export function useUpload(folderId: string | null) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>(null);

  const upload = useCallback(
    async (fileList: File[] | FileList) => {
      const files = Array.from(fileList)
        .filter((f) => f.size > 0 && !f.name.startsWith("."))
        .map((file) => ({ file, relativeDir: relativeDirOf(file) }));
      if (files.length === 0) return;
      setProgress({ done: 0, total: files.length });
      try {
        const uploaded = await presignAndPut(files, (done) =>
          setProgress({ done, total: files.length })
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
            {progress.done}/{progress.total}
          </>
        ) : (
          <>
            <FileUp className="size-4" /> Upload files
          </>
        )}
      </Button>
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
            Uploading {progress.done} of {progress.total}…
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
    </div>
  );
}
