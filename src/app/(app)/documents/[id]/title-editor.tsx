"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
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

  async function save() {
    if (!value.trim() || value.trim() === name) {
      setEditing(false);
      setValue(name);
      return;
    }
    setSaving(true);
    try {
      await renameDocument(documentId, value);
      toast.success("Document renamed");
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-1.5"
        action={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setEditing(false);
            setValue(name);
          }
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          disabled={saving}
          className="w-full max-w-md rounded-md border bg-card px-2 py-0.5 font-display text-3xl tracking-tight outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          title="Save name"
          disabled={saving}
          className="rounded-md p-1.5 text-primary hover:bg-accent"
        >
          <Check className="size-4" />
        </button>
        <button
          type="button"
          title="Cancel"
          onClick={() => {
            setEditing(false);
            setValue(name);
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </form>
    );
  }

  return (
    <span className="group/title flex items-center gap-2">
      <h1 className="font-display text-3xl tracking-tight">{name}</h1>
      <button
        type="button"
        title="Rename document"
        onClick={() => setEditing(true)}
        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/title:opacity-100 max-md:opacity-100"
      >
        <Pencil className="size-4" />
      </button>
    </span>
  );
}
