"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  presignAndPut,
  useLeaveGuard,
  UploadingOverlay,
  type UploadProgress,
} from "@/components/upload/uploader";
import { createSignatureRequestFromUpload } from "./actions";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.avif,.svg,.docx,.doc,.xlsx,.xls,.csv,.txt,.md";

/**
 * Upload-first entry point: pick a file, it lands in the library, and you go
 * straight into the field editor for it - no detour via /documents.
 */
export function SignatureUploadButton() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress>(null);
  useLeaveGuard(progress !== null);

  async function handleFile(file: File) {
    setProgress({ done: 0, total: 1, pct: 0 });
    try {
      const [uploaded] = await presignAndPut(
        [{ file, relativeDir: "" }],
        (done, pct) => setProgress({ done, total: 1, pct })
      );
      // Redirects into the editor on success.
      const res = await createSignatureRequestFromUpload(uploaded);
      if (res && "error" in res) toast.error(res.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFile(file);
        }}
      />
      <Button onClick={() => fileInput.current?.click()} disabled={!!progress}>
        {progress ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileUp className="size-4" />
        )}
        Upload &amp; request signatures
      </Button>
      <UploadingOverlay progress={progress} />
    </>
  );
}
