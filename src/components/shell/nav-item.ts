import { cn } from "@/lib/utils";

/**
 * The one nav-row treatment, shared by the sidebar, the mobile drawer and the
 * settings nav so all three read as the same family.
 *
 * The active marker is a rail on the leading edge. It is always in the DOM and
 * only scales on the Y axis, so it grows out of the row's centre instead of
 * popping in, and it costs no layout.
 */
export function navItemClasses({
  active,
  compact = false,
  tone = "sidebar",
}: {
  active: boolean;
  compact?: boolean;
  tone?: "sidebar" | "content";
}) {
  return cn(
    "focus-ring press group relative flex items-center gap-2.5 rounded-md pr-2.5 text-sm",
    "transition-[background-color,color] duration-[var(--dur)] ease-[var(--ease-out-soft)]",
    "before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:origin-center",
    "before:rounded-full before:bg-primary",
    "before:transition-transform before:duration-[var(--dur)] before:ease-[var(--ease-out-quint)]",
    compact ? "py-1.5 pl-3" : "py-2 pl-3",
    active ? "font-medium before:scale-y-100" : "before:scale-y-0",
    tone === "sidebar"
      ? active
        ? "bg-sidebar-accent text-sidebar-foreground"
        : "text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
      : active
        ? "bg-secondary text-foreground"
        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
  );
}

/** Icons sit a touch heavier and take the accent once their row is active. */
export function navIconClasses(active: boolean) {
  return cn(
    "size-4 shrink-0 transition-colors duration-[var(--dur)] ease-[var(--ease-out-soft)]",
    active && "text-primary"
  );
}
