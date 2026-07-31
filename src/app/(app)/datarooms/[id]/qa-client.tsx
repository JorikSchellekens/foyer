"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircleQuestion, CornerDownRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shell/empty-state";
import { timeAgo, initials } from "@/lib/format";
import { answerQuestion } from "../actions";

export type QuestionData = {
  id: string;
  body: string;
  viewerEmail: string | null;
  answer: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  createdAt: string;
};

export function QaTab({
  dataroomId,
  questions,
}: {
  dataroomId: string;
  questions: QuestionData[];
}) {
  if (questions.length === 0)
    return (
      <EmptyState
        icon={MessageCircleQuestion}
        title="No questions yet"
        description="When Q&A is enabled on a link, visitors can ask questions here and your answers are shared back inside the data room."
      />
    );

  const open = questions.filter((q) => !q.answer).length;
  return (
    <div className="max-w-2xl space-y-4">
      <p className="flex items-baseline font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="shrink-0">
          {open > 0 ? "Awaiting an answer" : "All answered"}
        </span>
        <span aria-hidden className="leader-dots text-muted-foreground/60" />
        <span className="shrink-0 tabular">
          {open} / {questions.length}
        </span>
      </p>
      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          dataroomId={dataroomId}
          q={q}
          index={i}
        />
      ))}
    </div>
  );
}

function QuestionCard({
  dataroomId,
  q,
  index,
}: {
  dataroomId: string;
  q: QuestionData;
  index: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [answering, setAnswering] = useState(false);

  async function post() {
    if (!draft.trim()) return;
    setAnswering(true);
    try {
      const res = await answerQuestion(dataroomId, q.id, draft);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Answer posted");
      router.refresh();
    } finally {
      setAnswering(false);
    }
  }

  return (
    <div
      className="stagger-item rounded-lg border bg-card p-4 shadow-[var(--shadow-hairline)]"
      style={{ "--i": Math.min(index, 10) } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[10px] font-semibold">
          {q.viewerEmail ? initials(q.viewerEmail) : "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">
              {q.viewerEmail ?? "Anonymous visitor"}
            </span>
            <span className="text-xs text-muted-foreground">
              {timeAgo(q.createdAt)}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{q.body}</p>

          {q.answer ? (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-accent px-3 py-2.5">
              <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div>
                <p className="whitespace-pre-wrap text-sm">{q.answer}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {q.answeredBy} · {q.answeredAt ? timeAgo(q.answeredAt) : ""}
                </p>
              </div>
            </div>
          ) : (
            <form className="mt-3 space-y-2" action={post}>
              <Label htmlFor={`answer-${q.id}`} className="sr-only">
                Answer this question
              </Label>
              <Textarea
                id={`answer-${q.id}`}
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter belongs to the textarea; the modifier posts.
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void post();
                  }
                }}
                placeholder="Write an answer…"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  type="submit"
                  disabled={answering || !draft.trim()}
                >
                  {answering && <Loader2 className="size-3.5 animate-spin" />}
                  {answering ? "Posting…" : "Post answer"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Visible to everyone with access to this room.
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
