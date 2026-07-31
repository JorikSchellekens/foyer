import { cn } from "@/lib/utils";

/**
 * A key, not a label: paper face, hairline border, and a one-pixel inset bottom
 * edge so it reads as a physical keycap next to the text it belongs to.
 */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px]",
        "border bg-background px-1 font-mono text-[10px] leading-none text-muted-foreground",
        "shadow-[inset_0_-1px_0_var(--border)]",
        className
      )}
    >
      {children}
    </kbd>
  );
}
