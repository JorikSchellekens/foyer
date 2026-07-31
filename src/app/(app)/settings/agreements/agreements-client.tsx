"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  FileSignature,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { EmptyState } from "@/components/shell/empty-state";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/format";
import { SettingsIntro } from "../section";
import { saveAgreement, deleteAgreement } from "../actions";

type AgreementRow = {
  id: string;
  name: string;
  type: "EMBEDDED" | "LINK" | "TEXT";
  requireName: boolean;
  hasFile: boolean;
  externalUrl: string | null;
  content: string | null;
  signatures: number;
  links: number;
};

const TYPE_LABEL: Record<AgreementRow["type"], string> = {
  EMBEDDED: "signature flow",
  LINK: "linked document",
  TEXT: "text",
};

export function AgreementsClient({
  agreements,
}: {
  agreements: AgreementRow[];
}) {
  const [editing, setEditing] = useState<AgreementRow | null | "new">(null);
  const [deleting, setDeleting] = useState<AgreementRow | null>(null);
  const router = useRouter();

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="Agreements"
        description="Agreements gate a link behind a signature: visitors sign before they see anything, and every signature is recorded with name, email, IP and timestamp."
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New agreement
          </Button>
        }
      />

      {agreements.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No agreements yet"
          description="Create a standard NDA once, then require it on any link."
        />
      ) : (
        <div className="space-y-1.5">
          {agreements.map((a, i) => (
            <div
              key={a.id}
              className="stagger-item hover-raise flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-[var(--shadow-hairline)] hover:border-input"
              style={{ "--i": i } as React.CSSProperties}
            >
              <FileSignature
                className="size-4 shrink-0 text-primary"
                strokeWidth={1.5}
              />
              <button
                className="focus-ring min-w-0 flex-1 rounded-sm text-left"
                onClick={() => setEditing(a)}
              >
                <p className="underline-grow inline-block max-w-full truncate text-sm font-medium">
                  {a.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pluralize(a.signatures, "signature")} ·{" "}
                  {pluralize(a.links, "link")}
                </p>
              </button>
              <Badge variant="secondary" className="lowercase">
                {TYPE_LABEL[a.type]}
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${a.name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleting(a)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <AgreementEditor
          agreement={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.links > 0
                ? `${pluralize(deleting.links, "link")} currently require this agreement and will stop asking for it. `
                : ""}
              {deleting && deleting.signatures > 0
                ? `The ${pluralize(deleting.signatures, "signature")} already collected are kept as a record.`
                : "No signatures have been collected against it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep agreement</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                const id = deleting?.id;
                setDeleting(null);
                if (!id) return;
                await deleteAgreement(id);
                toast.success("Agreement deleted");
                router.refresh();
              }}
            >
              Delete agreement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AgreementEditor({
  agreement,
  onClose,
}: {
  agreement: AgreementRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(agreement?.name ?? "Standard NDA");
  const [type, setType] = useState<"EMBEDDED" | "LINK" | "TEXT">(
    agreement?.type ?? "EMBEDDED"
  );
  const [requireName, setRequireName] = useState(
    agreement?.requireName ?? true
  );
  const [externalUrl, setExternalUrl] = useState(agreement?.externalUrl ?? "");
  const [content, setContent] = useState(agreement?.content ?? "");
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Enough has been typed that an accidental click outside must not throw it
  // away. Escape still closes: that is deliberate.
  const dirty =
    name !== (agreement?.name ?? "Standard NDA") ||
    type !== (agreement?.type ?? "EMBEDDED") ||
    externalUrl !== (agreement?.externalUrl ?? "") ||
    content !== (agreement?.content ?? "") ||
    !!fileKey;

  async function uploadPdf(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      toast.error("PDFs must be under 30 MB.");
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: [{ name: file.name, contentType: "application/pdf" }],
        }),
      });
      const { files } = await res.json();
      const put = await fetch(files[0].url, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: file,
      });
      if (!put.ok) throw new Error();
      setFileKey(files[0].key);
      setFileName(file.name);
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await saveAgreement({
        id: agreement?.id,
        name,
        requireName,
        type,
        fileKey,
        externalUrl: externalUrl || null,
        content: content || null,
      });
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(agreement ? "Agreement updated" : "Agreement created");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (dirty) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {agreement ? "Edit agreement" : "Create a new agreement"}
          </DialogTitle>
          <DialogDescription>
            Visitors must complete this before they can access a link that
            requires it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!saving && !uploading && name.trim()) void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-name`}>Display name</Label>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!name.trim()}
              autoFocus
            />
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={requireName}
              onCheckedChange={(v) => setRequireName(v === true)}
            />
            Require viewer&apos;s name
          </label>

          <fieldset className="space-y-1.5">
            <legend className="text-sm leading-none font-medium">
              Agreement type
            </legend>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as typeof type)}
              className="gap-2 pt-1"
            >
              <TypeRow
                value="EMBEDDED"
                title="Embedded signature flow"
                caption="Upload a PDF; visitors read it and draw their signature."
              />
              <TypeRow
                value="LINK"
                title="Linked document"
                caption="Point to an agreement hosted elsewhere."
              />
              <TypeRow
                value="TEXT"
                title="Text content"
                caption="Short terms shown inline."
              />
            </RadioGroup>
          </fieldset>

          {type === "EMBEDDED" && (
            <div className="reveal space-y-1.5">
              <Label htmlFor={`${uid}-pdf`}>Agreement PDF (max 30 MB)</Label>
              <label
                htmlFor={`${uid}-pdf`}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground transition-[background-color,border-color] duration-[var(--dur)] hover:border-input hover:bg-muted/50"
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : fileName ? (
                  <Check className="size-4 text-primary" strokeWidth={2.5} />
                ) : (
                  <Upload className="size-4" />
                )}
                {uploading
                  ? "Uploading…"
                  : fileName ??
                    (agreement?.hasFile
                      ? "PDF uploaded: choose a file to replace it"
                      : "Choose a file, or drag and drop")}
                <input
                  id={`${uid}-pdf`}
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={(e) =>
                    e.target.files?.[0] && uploadPdf(e.target.files[0])
                  }
                />
              </label>
            </div>
          )}
          {type === "LINK" && (
            <div className="reveal space-y-1.5">
              <Label htmlFor={`${uid}-url`}>Agreement URL</Label>
              <Input
                id={`${uid}-url`}
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://yourcompany.com/nda.pdf"
                spellCheck={false}
              />
            </div>
          )}
          {type === "TEXT" && (
            <div className="reveal space-y-1.5">
              <Label htmlFor={`${uid}-content`}>Agreement text</Label>
              <Textarea
                id={`${uid}-content`}
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="By accessing these materials you agree to keep them confidential…"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploading || !name.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving
                ? "Saving…"
                : agreement
                  ? "Save changes"
                  : "Create agreement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TypeRow({
  value,
  title,
  caption,
}: {
  value: string;
  title: string;
  caption: string;
}) {
  return (
    <label
      className={cn(
        "press flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-[var(--dur)] ease-[var(--ease-out-soft)] hover:bg-muted/50",
        "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:shadow-[var(--shadow-hairline)] has-focus-visible:border-ring"
      )}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{caption}</span>
      </span>
    </label>
  );
}
