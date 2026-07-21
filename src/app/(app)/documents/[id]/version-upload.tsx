"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadNewVersion, restoreVersion } from "../actions";

export function VersionUploadButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            const res = await fetch("/api/upload/presign", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                files: [
                  {
                    name: file.name,
                    contentType: file.type || "application/octet-stream",
                  },
                ],
              }),
            });
            if (!res.ok) throw new Error("Could not prepare the upload.");
            const { files } = await res.json();
            const put = await fetch(files[0].url, {
              method: "PUT",
              headers: {
                "content-type": file.type || "application/octet-stream",
              },
              body: file,
            });
            if (!put.ok) throw new Error("Upload failed.");
            const result = await uploadNewVersion(documentId, {
              key: files[0].key,
              name: file.name,
              size: file.size,
              contentType: file.type || "application/octet-stream",
            });
            if (result && "error" in result && result.error)
              throw new Error(result.error);
            toast.success("New version is live. Every link now serves it.");
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed.");
          } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
          }
        }}
      />
      <Button onClick={() => input.current?.click()} disabled={busy}>
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4" />
        )}
        New version
      </Button>
    </>
  );
}

export function RestoreVersionButton({
  documentId,
  versionId,
}: {
  documentId: string;
  versionId: string;
}) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs"
      onClick={async () => {
        const res = await restoreVersion(documentId, versionId);
        if (res && "error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Version restored");
        router.refresh();
      }}
    >
      <RotateCcw className="size-3" /> Make current
    </Button>
  );
}
