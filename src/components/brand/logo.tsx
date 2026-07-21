import { cn } from "@/lib/utils";

/**
 * The Foyer mark: an archway — the doorway of the room where visitors are
 * received. Uses currentColor so it inherits the surrounding text color;
 * pass a color via className (text-…) to override.
 */
export function FoyerMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-6", className)}
    >
      <rect x="8.2" y="24" width="15.6" height="1.9" rx="0.95" fill="currentColor" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 24.3 V14.6 A6 6 0 0 1 22 14.6 V24.3 H19.5 V15.2 A3.5 3.5 0 0 0 12.5 15.2 V24.3 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** The mark inside its library-green tile, for standalone/avatar contexts. */
export function FoyerBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[22%] bg-primary text-primary-foreground",
        className
      )}
    >
      <FoyerMark className="size-[72%]" />
    </span>
  );
}

/**
 * Full wordmark: the mark set against the "Foyer" name in the display serif.
 * `size` scales both together.
 */
export function FoyerLogo({
  className,
  size = "md",
  markClassName,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  markClassName?: string;
}) {
  const scale = {
    sm: { mark: "size-5", text: "text-lg" },
    md: { mark: "size-6", text: "text-xl" },
    lg: { mark: "size-8", text: "text-3xl" },
  }[size];

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <FoyerMark className={cn(scale.mark, "text-primary", markClassName)} />
      <span
        className={cn(
          "font-display italic leading-none tracking-tight",
          scale.text
        )}
      >
        Foyer
      </span>
    </span>
  );
}
