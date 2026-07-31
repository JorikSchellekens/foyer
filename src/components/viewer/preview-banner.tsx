import { Eye } from "lucide-react";

/**
 * Slim strip shown at the top of the viewer when a team member is previewing
 * their own link. Carries its own colours so it reads on both the dark
 * document viewer and the light data room index: an ink bar with one warm
 * signal, unmistakable at a glance without shouting over the document.
 */
export function PreviewBanner({ text }: { text?: string }) {
  return (
    <div className="z-50 flex shrink-0 flex-wrap items-center justify-center gap-x-2.5 gap-y-1 border-b border-amber-300/25 bg-[#1b1810] px-4 py-1.5 text-center text-xs text-amber-100/75">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300">
        <Eye className="size-3" />
        Preview
      </span>
      <span>
        {text ??
          "This is exactly what visitors see. Nothing here is recorded."}
      </span>
    </div>
  );
}
