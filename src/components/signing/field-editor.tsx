"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  FIELD_KINDS,
  FIELD_LABELS,
  FIELD_DEFAULT_SIZE,
  signerColor,
  type FieldKind,
} from "@/lib/sign-fields";
import type { CanvasField } from "./pdf-field-canvas";

// pdfjs touches browser globals (DOMMatrix) at module scope - never SSR it.
const PdfFieldCanvas = dynamic(
  () => import("./pdf-field-canvas").then((m) => m.PdfFieldCanvas),
  { ssr: false }
);
import {
  saveSigners,
  saveFields,
  updateSignatureRequest,
  sendSignatureRequest,
  deleteSignatureDraft,
} from "@/app/(app)/signatures/actions";

type EditorSigner = {
  id: string;
  email: string;
  name: string | null;
  role: "SIGNER" | "CC";
  order: number;
};

export function FieldEditor({
  requestId,
  fileUrl,
  initialTitle,
  initialMessage,
  initialSequential,
  initialSigners,
  initialFields,
}: {
  requestId: string;
  fileUrl: string;
  initialTitle: string;
  initialMessage: string | null;
  initialSequential: boolean;
  initialSigners: EditorSigner[];
  initialFields: CanvasField[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [message, setMessage] = useState(initialMessage ?? "");
  const [sequential, setSequential] = useState(initialSequential);
  const [signers, setSigners] = useState<EditorSigner[]>(initialSigners);
  const [fields, setFields] = useState<CanvasField[]>(initialFields);
  const [activeSignerId, setActiveSignerId] = useState<string | null>(
    initialSigners.find((s) => s.role === "SIGNER")?.id ?? null
  );
  const [armedKind, setArmedKind] = useState<FieldKind | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [sending, setSending] = useState(false);

  const colorIndex = Object.fromEntries(
    signers.filter((s) => s.role === "SIGNER").map((s, i) => [s.id, i])
  );

  // Debounced field persistence: the canvas mutates locally on every pointer
  // move; only the settled state needs to reach the server.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
  const toPayload = (list: CanvasField[]) =>
    list.map((f) => ({
      signerId: f.signerId,
      kind: f.kind,
      page: f.page,
      xPct: f.xPct,
      yPct: f.yPct,
      wPct: f.wPct,
      hPct: f.hPct,
      required: f.required,
    }));
  const scheduleFieldSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await saveFields(requestId, toPayload(fieldsRef.current));
      if (res && "error" in res) toast.error(res.error);
    }, 700);
  }, [requestId]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  async function flushFieldSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const res = await saveFields(requestId, toPayload(fieldsRef.current));
    if (res && "error" in res) throw new Error(res.error);
  }

  async function persistSigners(next: EditorSigner[]) {
    const res = await saveSigners(
      requestId,
      next.map((s) => ({
        id: s.id.startsWith("new:") ? undefined : s.id,
        email: s.email,
        name: s.name ?? undefined,
        role: s.role,
        order: s.order,
      }))
    );
    if ("error" in res) {
      toast.error(res.error);
      return null;
    }
    // Server assigns real ids; match them back by email (unique per request).
    const byEmail = new Map(res.signers!.map((s) => [s.email, s.id]));
    const reconciled = next.map((s) => ({ ...s, id: byEmail.get(s.email) ?? s.id }));
    setSigners(reconciled);
    return reconciled;
  }

  async function addRecipient() {
    const email = newEmail.trim().toLowerCase();
    if (!email || signers.some((s) => s.email === email)) return;
    const next = [
      ...signers,
      {
        id: `new:${email}`,
        email,
        name: null,
        role: "SIGNER" as const,
        order: sequential ? signers.length : 0,
      },
    ];
    const reconciled = await persistSigners(next);
    if (reconciled) {
      setNewEmail("");
      const added = reconciled.find((s) => s.email === email);
      if (added) setActiveSignerId(added.id);
    }
  }

  async function removeRecipient(id: string) {
    const next = signers.filter((s) => s.id !== id);
    setFields((f) => f.filter((fl) => fl.signerId !== id));
    scheduleFieldSave();
    const reconciled = await persistSigners(next);
    if (reconciled && activeSignerId === id)
      setActiveSignerId(reconciled.find((s) => s.role === "SIGNER")?.id ?? null);
  }

  function placeField(page: number, xPct: number, yPct: number) {
    if (!armedKind || !activeSignerId) return;
    const size = FIELD_DEFAULT_SIZE[armedKind];
    const field: CanvasField = {
      id: crypto.randomUUID(),
      signerId: activeSignerId,
      kind: armedKind,
      page,
      xPct: Math.min(xPct, 1 - size.wPct),
      yPct: Math.min(yPct, 1 - size.hPct),
      wPct: size.wPct,
      hPct: size.hPct,
      required: true,
    };
    setFields((f) => [...f, field]);
    setSelectedId(field.id);
    setArmedKind(null);
    scheduleFieldSave();
  }

  function updateField(id: string, patch: Partial<CanvasField>) {
    setFields((f) => f.map((fl) => (fl.id === id ? { ...fl, ...patch } : fl)));
    scheduleFieldSave();
  }

  function deleteSelected() {
    if (!selectedId) return;
    setFields((f) => f.filter((fl) => fl.id !== selectedId));
    setSelectedId(null);
    scheduleFieldSave();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
      if (e.key === "Escape") setArmedKind(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function send() {
    setSending(true);
    try {
      await updateSignatureRequest(requestId, { title, message, sequential });
      await flushFieldSave();
      const res = await sendSignatureRequest(requestId);
      if (res && "error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Signature request sent.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  const activeSigners = signers.filter((s) => s.role === "SIGNER");
  const activeSigner = signers.find((s) => s.id === activeSignerId);
  const activeColor =
    activeSignerId !== null && colorIndex[activeSignerId] !== undefined
      ? signerColor(colorIndex[activeSignerId])
      : null;
  const selectedField = fields.find((f) => f.id === selectedId);
  // Signers with nothing to do are almost always an oversight, so say so
  // before the request goes out. Not a block: the server decides validity.
  const unassigned = activeSigners.filter(
    (s) => !fields.some((f) => f.signerId === s.id)
  );

  return (
    <div className="flex h-screen flex-col">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3 sm:px-8">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => updateSignatureRequest(requestId, { title })}
          className="w-72 font-medium"
          aria-label="Request title"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="sequential"
            checked={sequential}
            onCheckedChange={(v) => {
              setSequential(v);
              updateSignatureRequest(requestId, { sequential: v });
            }}
          />
          <Label htmlFor="sequential" className="text-sm text-muted-foreground">
            Sign in order
          </Label>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {unassigned.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {unassigned.length === 1
                ? "1 recipient has no fields"
                : `${unassigned.length} recipients have no fields`}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteSignatureDraft(requestId)}
          >
            <Trash2 className="size-4" /> Discard
          </Button>
          <Button onClick={send} disabled={sending || activeSigners.length === 0}>
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {sending ? "Sending" : "Send for signature"}
          </Button>
        </div>
      </div>

      {/* Below lg the tool panel sits under the document rather than starving
          it of width. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* document canvas */}
        <div className="min-h-0 min-w-0 flex-1">
          <PdfFieldCanvas
            fileUrl={fileUrl}
            fields={fields}
            mode="edit"
            signerColorIndex={colorIndex}
            armedKind={armedKind}
            selectedId={selectedId}
            onPlace={placeField}
            onChange={updateField}
            onSelect={setSelectedId}
          />
        </div>

        {/* right panel */}
        <div className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-t bg-card p-4 max-lg:max-h-[45%] lg:w-80 lg:border-l lg:border-t-0">
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-medium">Recipients</h3>
              {sequential && activeSigners.length > 1 && (
                <span className="text-[11px] text-muted-foreground">
                  signing in order
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {signers.map((s) => {
                const idx = colorIndex[s.id];
                const color = idx !== undefined ? signerColor(idx) : null;
                const active = s.id === activeSignerId;
                const count = fields.filter((f) => f.signerId === s.id).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={s.role === "SIGNER" ? active : undefined}
                    onClick={() => s.role === "SIGNER" && setActiveSignerId(s.id)}
                    className={`press flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-[background-color,border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] ${
                      active
                        ? "border-foreground/30 bg-accent shadow-[var(--shadow-raise)]"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    {/* Same swatch the recipient's fields wear on the page. */}
                    {color && (
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full ring-2 ring-transparent transition-shadow"
                        style={{
                          background: color.border,
                          boxShadow: active ? `0 0 0 3px ${color.bg}` : undefined,
                        }}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{s.email}</span>
                    {s.role === "CC" && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        cc
                      </span>
                    )}
                    {s.role === "SIGNER" && count > 0 && (
                      <span
                        className="shrink-0 font-mono text-[10px] tabular"
                        style={{ color: color?.border }}
                        title={`${count} field${count === 1 ? "" : "s"} placed`}
                      >
                        {count}
                      </span>
                    )}
                    {sequential && s.role === "SIGNER" && (
                      <span className="shrink-0 font-mono text-[10px] tabular text-muted-foreground">
                        #{s.order + 1}
                      </span>
                    )}
                    <span
                      role="button"
                      aria-label={`Remove ${s.email}`}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecipient(s.id);
                      }}
                    >
                      <X className="size-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                addRecipient();
              }}
            >
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="signer@company.com"
                className="h-8 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="h-8"
                aria-label="Add recipient"
              >
                <Plus className="size-3.5" />
              </Button>
            </form>
          </section>

          <section>
            <div className="mb-2 flex min-w-0 items-baseline gap-2">
              <h3 className="text-sm font-medium">Fields</h3>
              {activeSigner && (
                <span
                  className="min-w-0 flex-1 truncate text-[11px]"
                  style={{ color: activeColor?.border }}
                >
                  for {activeSigner.email}
                </span>
              )}
            </div>
            {activeSignerId ? (
              <div className="grid grid-cols-2 gap-1.5">
                {FIELD_KINDS.map((kind) => (
                  <Button
                    key={kind}
                    type="button"
                    data-palette={kind}
                    aria-pressed={armedKind === kind}
                    variant={armedKind === kind ? "default" : "outline"}
                    size="sm"
                    className="justify-start"
                    onClick={() =>
                      setArmedKind((k) => (k === kind ? null : kind))
                    }
                  >
                    {FIELD_LABELS[kind]}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Add a recipient first, then place their fields.
              </p>
            )}
            {armedKind && (
              <p className="mt-2 rounded-md border border-dashed bg-accent/40 px-2 py-1.5 text-xs text-muted-foreground">
                Click the document to place the{" "}
                {FIELD_LABELS[armedKind].toLowerCase()} field. Esc to cancel.
              </p>
            )}
            {selectedField && (
              <div className="mt-2 space-y-1.5 rounded-md border p-2">
                <p className="text-xs">
                  {FIELD_LABELS[selectedField.kind]}
                  <span className="ml-1.5 font-mono text-[10px] tabular text-muted-foreground">
                    p.{selectedField.page}
                  </span>
                </p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Drag to move, corner to resize, arrow keys to nudge (hold
                  Shift for a bigger step).
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-1.5 text-destructive"
                  onClick={deleteSelected}
                >
                  <Trash2 className="size-3.5" /> Remove field
                </Button>
              </div>
            )}
            {!armedKind && !selectedField && fields.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Pick a field type, then click where it belongs on the document.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium" id="message-heading">
              Message to recipients
            </h3>
            <Textarea
              aria-labelledby="message-heading"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onBlur={() => updateSignatureRequest(requestId, { message })}
              placeholder="Optional note included in the invitation email"
              rows={3}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
