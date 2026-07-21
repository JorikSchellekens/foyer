"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircleQuestion, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="max-w-2xl space-y-4">
      {questions.map((q) => (
        <QuestionCard key={q.id} dataroomId={dataroomId} q={q} />
      ))}
    </div>
  );
}

function QuestionCard({
  dataroomId,
  q,
}: {
  dataroomId: string;
  q: QuestionData;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [answering, setAnswering] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-4">
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
            <form
              className="mt-3 space-y-2"
              action={async () => {
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
              }}
            >
              <Textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write an answer…"
              />
              <Button size="sm" type="submit" disabled={answering || !draft.trim()}>
                Post answer
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
