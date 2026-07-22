"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

/**
 * App-wide light/dark theming. Drives the `.dark` class on <html> that
 * globals.css (`@custom-variant dark`) and the shadcn chart wrapper key off.
 * System preference by default; the sidebar toggle overrides it.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
