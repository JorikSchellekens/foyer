"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CornerDownRight, Loader2, MessageCircleQuestion } from "lucide-react";
import { askQuestion } from "@/app/view/actions";

export function QaWidget({
  slug,
  brandColor,
  questions,
}: {
  slug: string;
  brandColor: string;
  questions: { id: string; body: string; answer: string | null }[];
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const answered = questions.filter((q) => q.answer);

  return (
    <section
      className="mt-16 border-t border-current/10 pt-10"
      // The sender's colour drives focus rings here, so the section belongs to
      // their room rather than to Foyer's palette.
      style={{ "--brand": brandColor } as React.CSSProperties}
    >
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <MessageCircleQuestion className="size-5 opacity-50" strokeWidth={1.5} />
        Questions
      </h2>

      {answered.length > 0 ? (
        <ol className="mt-6 space-y-6">
          {answered.map((q, i) => (
            <li
              key={q.id}
              className="stagger-item"
              style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
            >
              <p className="text-sm font-medium leading-relaxed">{q.body}</p>
              <div className="mt-2 flex items-start gap-2.5 border-l border-current/15 pl-3 text-sm opacity-75">
                <CornerDownRight
                  className="mt-0.5 size-3.5 shrink-0 opacity-70"
                  strokeWidth={1.5}
                />
                <p className="whitespace-pre-wrap leading-relaxed">{q.answer}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 max-w-md text-sm leading-relaxed opacity-60">
          No questions answered here yet. Ask anything about these documents and
          the team is notified by email.
        </p>
      )}

      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        action={async () => {
          if (!draft.trim()) return;
          setBusy(true);
          try {
            const res = await askQuestion(slug, draft);
            if (res && "error" in res && res.error) {
              toast.error(res.error);
              return;
            }
            toast.success("Question sent. The team is notified by email.");
            setDraft("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask the team a question…"
          aria-label="Your question"
          className="flex-1 rounded-md border border-current/20 bg-white/90 px-3 py-2 text-sm text-neutral-900 outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] placeholder:text-neutral-400 focus-visible:border-[var(--brand)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--brand)_35%,transparent)]"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-busy={busy}
          className="press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white outline-none transition-opacity duration-[var(--dur-fast)] hover:opacity-85 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--brand)_45%,transparent)] disabled:opacity-40"
          style={{ backgroundColor: brandColor }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          {busy ? "Sending…" : "Send question"}
        </button>
      </form>
    </section>
  );
}
