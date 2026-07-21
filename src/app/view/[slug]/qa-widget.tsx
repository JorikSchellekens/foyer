"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CornerDownRight, MessageCircleQuestion } from "lucide-react";
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
    <section className="mt-14">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <MessageCircleQuestion className="size-5 opacity-60" />
        Questions
      </h2>

      {answered.length > 0 && (
        <div className="mt-5 space-y-5">
          {answered.map((q) => (
            <div key={q.id}>
              <p className="text-sm font-medium">{q.body}</p>
              <div className="mt-1.5 flex items-start gap-2 text-sm opacity-80">
                <CornerDownRight className="mt-0.5 size-3.5 shrink-0" />
                <p className="whitespace-pre-wrap">{q.answer}</p>
              </div>
            </div>
          ))}
        </div>
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
          className="flex-1 rounded-md border border-current/20 bg-white/90 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-40"
          style={{ backgroundColor: brandColor }}
        >
          {busy ? "Sending…" : "Send question"}
        </button>
      </form>
    </section>
  );
}
