import { cn } from "@/lib/utils";

/**
 * The page shape every settings screen shares: a short intro, then hairline
 * cards whose titles sit on the display face. Ten screens using the same three
 * pieces is what makes moving between them feel like one product rather than
 * ten forms.
 */
export function SettingsIntro({
  title,
  description,
  action,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "reveal flex items-start justify-between gap-4 pb-1",
        className
      )}
    >
      <div className="min-w-0">
        {title && (
          <h2 className="font-display text-xl font-normal">{title}</h2>
        )}
        {description && (
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  icon: Icon,
  action,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "reveal-up overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-hairline)]",
        className
      )}
    >
      <header className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-base font-normal">
            {Icon && (
              <Icon
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
              />
            )}
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children && (
        <div className={cn("border-t px-4 py-4 sm:px-5", bodyClassName)}>
          {children}
        </div>
      )}
      {footer && (
        <div className="border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          {footer}
        </div>
      )}
    </section>
  );
}

/**
 * A label plus one line of explanation on the left, its control on the right.
 * Dot leaders tie the two together the way the rest of the app does, and keep
 * a long list of switches readable as rows rather than a wall.
 */
export function SettingsRow({
  label,
  description,
  htmlFor,
  descriptionId,
  control,
  leaders = true,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  htmlFor?: string;
  descriptionId?: string;
  control: React.ReactNode;
  leaders?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-start gap-3 py-3 first:pt-0 last:pb-0", className)}
    >
      <div className="min-w-0 flex-1">
        {/* Leaders ride the label's baseline, so they only span the first line. */}
        <span className="flex items-baseline">
          <label
            htmlFor={htmlFor}
            className={cn(
              "text-sm font-medium",
              htmlFor && "cursor-pointer"
            )}
          >
            {label}
          </label>
          {leaders && (
            <span aria-hidden className="leader-dots text-muted-foreground/70" />
          )}
        </span>
        {description && (
          <p
            id={descriptionId}
            className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted-foreground"
          >
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}
