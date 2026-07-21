"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";

export async function uploadImage(file: File): Promise<string | null> {
  if (file.size > 2 * 1024 * 1024) {
    toast.error("Images must be under 2 MB.");
    return null;
  }
  const res = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      files: [{ name: file.name, contentType: file.type || "image/png" }],
    }),
  });
  if (!res.ok) {
    toast.error("Upload failed.");
    return null;
  }
  const { files } = await res.json();
  const put = await fetch(files[0].url, {
    method: "PUT",
    headers: { "content-type": file.type || "image/png" },
    body: file,
  });
  if (!put.ok) {
    toast.error("Upload failed.");
    return null;
  }
  return files[0].key as string;
}

export function ImageField({
  label,
  hint,
  value,
  onChange,
  wide,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (key: string | null) => void;
  wide?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center justify-center overflow-hidden rounded-md border bg-muted/40 ${
            wide ? "h-16 w-40" : "size-16"
          }`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/assets/${value}`}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground/50" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            Upload
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                const key = await uploadImage(file);
                setBusy(false);
                if (key) onChange(key);
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              className="text-left text-xs text-muted-foreground hover:text-destructive"
              onClick={() => onChange(null)}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
