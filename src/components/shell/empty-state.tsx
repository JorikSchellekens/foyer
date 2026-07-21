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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-8 py-20 text-center">
      {Icon && (
        <Icon className="mb-4 size-8 text-muted-foreground/60" strokeWidth={1.25} />
      )}
      <h2 className="font-display text-2xl">{title}</h2>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children && <div className="mt-6 flex items-center gap-2">{children}</div>}
    </div>
  );
}
