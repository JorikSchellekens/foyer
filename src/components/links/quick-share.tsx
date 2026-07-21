"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { quickShareLink } from "@/app/(app)/links/actions";

type Target = { type: "DOCUMENT" | "DATAROOM"; id: string };

async function share(target: Target): Promise<boolean> {
  const res = await quickShareLink(target);
  if ("error" in res) {
    toast.error(res.error);
    return false;
  }
  await navigator.clipboard.writeText(res.url);
  toast.success(res.created ? "New link created and copied" : "Link copied");
  return true;
}

/** "Copy link" item for a row dropdown menu. */
export function ShareMenuItem({ target }: { target: Target }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <DropdownMenuItem
      onSelect={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        const ok = await share(target);
        setBusy(false);
        if (ok) router.refresh();
      }}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Link2 className="size-4" />
      )}
      Copy link
    </DropdownMenuItem>
  );
}

/** Standalone copy-link button, e.g. on a card. Morphs to a check on success. */
export function ShareButton({
  target,
  className,
}: {
  target: Target;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title="Copy link"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        const ok = await share(target);
        setBusy(false);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
          router.refresh();
        }
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : done ? (
        <Check className="size-4 text-primary" />
      ) : (
        <Link2 className="size-4" />
      )}
    </button>
  );
}
