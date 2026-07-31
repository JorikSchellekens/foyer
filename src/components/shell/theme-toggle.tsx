"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Light/dark toggle. Which glyph shows is driven purely by the `.dark` class
 * (via Tailwind's dark variant), so there's no hydration flash and no
 * setState-in-effect: the pre-paint theme script has already set the class.
 *
 * The swap is an animation on a remounted node rather than a transition:
 * next-themes' disableTransitionOnChange suppresses transitions for the frame
 * in which the class flips, so a transition here would never run. The counter
 * starts at 0 so the icon does not animate on first paint.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [swaps, setSwaps] = useState(0);

  return (
    <button
      type="button"
      onClick={() => {
        setSwaps((n) => n + 1);
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      }}
      title="Toggle theme"
      aria-label="Toggle light or dark theme"
      className={
        className ??
        "focus-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:bg-sidebar-accent hover:text-foreground"
      }
    >
      <span
        key={swaps}
        className={cn(
          "inline-flex",
          swaps > 0 &&
            "animate-in fade-in-0 zoom-in-75 spin-in-90 duration-[var(--dur-slow)] ease-[var(--ease-out-quint)]"
        )}
      >
        <Sun className="hidden size-4 dark:block" />
        <Moon className="block size-4 dark:hidden" />
      </span>
    </button>
  );
}
