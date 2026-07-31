"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { renameDocument } from "../actions";

export function DocumentTitle({
  documentId,
  name,
}: {
  documentId: string;
  name: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  // Show the new name the moment it is accepted, without waiting for the
  // refreshed page to come back from the server.
  const [shown, setShown] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter submits and then blurs: keep the rename from being sent twice.
  const inFlight = useRef(false);

  // The server is the source of truth once it answers: adjust during render
  // rather than in an effect, so no extra pass is needed.
  const [lastName, setLastName] = useState(name);
  if (lastName !== name) {
    setLastName(name);
    setShown(name);
    setValue(name);
  }

  // Select the whole name on entry: renaming usually means replacing.
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function cancel() {
    setEditing(false);
    setValue(shown);
  }

  async function save() {
    if (inFlight.current) return;
    const next = value.trim();
    if (!next || next === shown) {
      cancel();
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await renameDocument(documentId, next);
      setShown(next);
      setEditing(false);
      toast.success("Document renamed");
      router.refresh();
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-1.5"
        action={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          autoFocus
          disabled={saving}
          aria-label="Document name"
          className="focus-ring w-full max-w-md rounded-md border bg-card px-2 py-0.5 font-display text-3xl tracking-tight outline-none disabled:opacity-70"
        />
        <button
          type="submit"
          aria-label="Save name"
          title="Save name"
          disabled={saving}
          className="press focus-ring rounded-md p-1.5 text-primary transition-colors duration-[var(--dur-fast)] hover:bg-accent disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Check className="size-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          aria-label="Cancel renaming"
          title="Cancel (Esc)"
          // Fire before the input's blur-save so Cancel really cancels.
          onMouseDown={(e) => {
            e.preventDefault();
            cancel();
          }}
          className="press focus-ring rounded-md p-1.5 text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:bg-accent"
        >
          <X className="size-4" aria-hidden />
        </button>
      </form>
    );
  }

  return (
    <span className="group/title flex items-center gap-2">
      <h1
        onDoubleClick={() => setEditing(true)}
        className="font-display text-3xl tracking-tight decoration-border decoration-dotted underline-offset-[6px] group-hover/title:underline"
      >
        {shown}
      </h1>
      <button
        type="button"
        aria-label="Rename document"
        title="Rename document"
        onClick={() => setEditing(true)}
        className="press focus-ring rounded-md p-1.5 text-muted-foreground opacity-0 transition-[opacity,color,background-color] duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/title:opacity-100 max-md:opacity-100"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
    </span>
  );
}
