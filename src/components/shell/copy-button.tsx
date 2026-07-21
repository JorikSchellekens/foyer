"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {copied ? (
        <Check className="size-3.5 text-primary" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {label && <span className="text-xs">{copied ? "Copied" : label}</span>}
    </button>
  );
}
