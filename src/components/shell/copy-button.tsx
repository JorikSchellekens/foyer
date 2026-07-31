"use client";

import { useEffect, useRef, useState } from "react";
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (
    <button
      type="button"
      title={copied ? "Copied" : "Copy"}
      aria-label={label ? undefined : "Copy"}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          return;
        }
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      }}
      className={cn(
        "focus-ring press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md",
        "text-muted-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)]",
        "hover:bg-accent hover:text-foreground",
        label ? "h-8 px-2" : "size-8",
        copied && "text-primary",
        className
      )}
    >
      {/* Both glyphs stacked so the confirmation crossfades in place instead of
          reflowing the row. */}
      <span className="relative inline-flex size-3.5 items-center justify-center">
        <Copy
          className={cn(
            "absolute size-3.5 transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-quint)]",
            copied ? "scale-75 opacity-0" : "scale-100 opacity-100"
          )}
        />
        <Check
          className={cn(
            "absolute size-3.5 text-primary transition-[opacity,transform] duration-[var(--dur)] ease-[var(--ease-out-quint)]",
            copied ? "scale-100 opacity-100" : "scale-50 opacity-0"
          )}
        />
      </span>
      {label && <span className="text-xs">{copied ? "Copied" : label}</span>}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
