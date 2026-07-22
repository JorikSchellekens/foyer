"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

/**
 * Light/dark toggle. Which glyph shows is driven purely by the `.dark` class
 * (via Tailwind's dark variant), so there's no hydration flash and no
 * setState-in-effect: the pre-paint theme script has already set the class.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      title="Toggle theme"
      aria-label="Toggle light or dark theme"
      className={
        className ??
        "rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      }
    >
      <Sun className="hidden size-3.5 dark:block" />
      <Moon className="block size-3.5 dark:hidden" />
    </button>
  );
}
