import { Eye } from "lucide-react";

/**
 * Slim strip shown at the top of the viewer when a team member is previewing
 * their own link. Carries its own colours so it reads on both the dark
 * document viewer and the light data room index.
 */
export function PreviewBanner({ text }: { text?: string }) {
  return (
    <div className="z-50 flex shrink-0 items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
      <Eye className="size-3.5" />
      {text ??
        "Preview - this is exactly what visitors see. Nothing here is recorded."}
    </div>
  );
}
