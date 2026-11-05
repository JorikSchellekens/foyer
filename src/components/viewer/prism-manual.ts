/**
 * Prism highlights every `code[class*="language-"]` on the page as soon as
 * it loads, unless window.Prism.manual is set first. That edits the server
 * HTML before React hydrates it, which React reports as a mismatch. In manual
 * mode only react-notion-x's Code component highlights, from an effect, after
 * hydration. Import this before anything that imports prismjs.
 */
if (typeof window !== "undefined") {
  const w = window as unknown as { Prism?: Record<string, unknown> };
  w.Prism = { ...(w.Prism ?? {}), manual: true };
}
export {};
