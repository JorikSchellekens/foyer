import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="reveal flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/40 px-6 py-16 text-center sm:px-8 sm:py-20">
      {Icon && (
        // The icon sits in its own dashed tile: an empty frame waiting to be
        // filled, which reads as an invitation rather than a failure.
        <span className="mb-4 inline-flex size-11 items-center justify-center rounded-full border border-dashed">
          <Icon className="size-5 text-muted-foreground/70" strokeWidth={1.25} />
        </span>
      )}
      <h2 className="font-display text-2xl text-balance">{title}</h2>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
          {description}
        </p>
      )}
      {children && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
