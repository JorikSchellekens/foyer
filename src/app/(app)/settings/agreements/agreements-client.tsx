"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSignature, Plus, Trash2, Upload } from "lucide-react";
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
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { EmptyState } from "@/components/shell/empty-state";
import { pluralize } from "@/lib/format";
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

export function AgreementsClient({
  agreements,
}: {
  agreements: AgreementRow[];
}) {
  const [editing, setEditing] = useState<AgreementRow | null | "new">(null);
  const router = useRouter();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Agreements gate a link behind a signature: visitors sign before they
          see anything, and every signature is recorded with name, email, IP
          and timestamp.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New agreement
        </Button>
      </div>

      {agreements.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No agreements yet"
          description="Create a standard NDA once, then require it on any link."
        />
      ) : (
        <div className="space-y-1.5">
          {agreements.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <FileSignature className="size-4 text-primary" strokeWidth={1.5} />
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setEditing(a)}
              >
                <p className="truncate text-sm font-medium hover:underline">
                  {a.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pluralize(a.signatures, "signature")} ·{" "}
                  {pluralize(a.links, "link")}
                </p>
              </button>
              <Badge variant="secondary" className="lowercase">
                {a.type === "EMBEDDED"
                  ? "signature flow"
                  : a.type === "LINK"
                    ? "linked document"
                    : "text"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  await deleteAgreement(a.id);
                  toast.success("Agreement deleted");
                  router.refresh();
                }}
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {agreement ? "Edit agreement" : "Create a new agreement"}
          </DialogTitle>
          <DialogDescription>
            Visitors must complete this before they can access a link that
            requires it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={requireName}
              onCheckedChange={(v) => setRequireName(v === true)}
            />
            Require viewer&apos;s name
          </label>

          <div className="space-y-1.5">
            <Label>Agreement type</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as typeof type)}
              className="gap-2"
            >
              <label className="flex items-start gap-3 rounded-md border px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
                <RadioGroupItem value="EMBEDDED" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">
                    Embedded signature flow
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Upload a PDF; visitors read it and draw their signature.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
                <RadioGroupItem value="LINK" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">
                    Linked document
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Point to an agreement hosted elsewhere.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
                <RadioGroupItem value="TEXT" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">
                    Text content
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Short terms shown inline.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {type === "EMBEDDED" && (
            <div className="space-y-1.5">
              <Label>Agreement PDF (max 30 MB)</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground hover:bg-muted/50">
                <Upload className="size-4" />
                {uploading
                  ? "Uploading…"
                  : fileName ??
                    (agreement?.hasFile
                      ? "PDF uploaded — choose a file to replace it"
                      : "Choose file to upload or drag and drop")}
                <input
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
            <div className="space-y-1.5">
              <Label>Agreement URL</Label>
              <Input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://yourcompany.com/nda.pdf"
              />
            </div>
          )}
          {type === "TEXT" && (
            <div className="space-y-1.5">
              <Label>Agreement text</Label>
              <Textarea
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="By accessing these materials you agree to keep them confidential…"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={saving || uploading || !name.trim()}
            onClick={async () => {
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
            }}
          >
            {saving
              ? "Saving…"
              : agreement
                ? "Save changes"
                : "Create agreement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
