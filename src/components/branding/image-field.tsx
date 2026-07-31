"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
  const [over, setOver] = useState(false);
  const inputId = useId();

  async function take(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That is not an image file.");
      return;
    }
    setBusy(true);
    const key = await uploadImage(file);
    setBusy(false);
    if (key) onChange(key);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex items-center gap-3">
        {/* The preview doubles as a drop target: dragging a logo onto the
            thumbnail is the obvious gesture, so accept it. */}
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void take(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border bg-muted/40 transition-[border-color,background-color,box-shadow] duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:border-input",
            over && "border-primary bg-accent",
            wide ? "h-16 w-40" : "size-16"
          )}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/assets/${value}`}
              alt=""
              className="reveal h-full w-full object-contain"
            />
          ) : (
            <ImageIcon
              className="size-5 text-muted-foreground/50"
              strokeWidth={1.5}
            />
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-4 animate-spin text-primary" />
            </span>
          )}
        </label>
        <div className="flex flex-col items-start gap-1.5">
          <label
            htmlFor={inputId}
            className="press focus-within:ring-3 focus-within:ring-ring/50 inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors duration-[var(--dur-fast)] hover:bg-accent"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            {value ? "Replace" : "Upload"}
            <input
              id={inputId}
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={async (e) => {
                await take(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              className="underline-grow text-left text-xs text-muted-foreground transition-colors hover:text-destructive"
              onClick={() => onChange(null)}
            >
              Remove
            </button>
          )}
          {!value && (
            <span className="text-xs text-muted-foreground">
              or drop an image
            </span>
          )}
        </div>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
