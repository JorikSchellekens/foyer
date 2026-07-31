"use client";

/**
 * Last resort: the root layout itself failed, so this file replaces it. It
 * therefore ships its own document, its own colours and no dependencies at all
 * - not the design system, not the fonts, not even a stylesheet import, since
 * whatever broke may have been exactly that. Paper and ink by hand, with a
 * system serif standing in for the display face.
 */
const PALETTE = `
  :root { color-scheme: light; --paper: #fafaf8; --ink: #16181d; --muted: #6b6f76; --line: #e7e6e0; --accent: #175b47; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --paper: #101418; --ink: #f2f1ec; --muted: #9ba0a6; --line: rgb(255 255 255 / 0.12); --accent: #4caf8b; }
  }
  body { margin: 0; background: var(--paper); color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { min-height: 100svh; display: flex; align-items: center; justify-content: center; padding: 4rem 1.5rem; }
  .col { width: 100%; max-width: 26rem; }
  h1 { margin: 0; font-family: Georgia, "Times New Roman", serif;
    font-size: 2rem; line-height: 1.12; letter-spacing: -0.011em; font-weight: 400; }
  p { margin: 0.75rem 0 0; font-size: 0.875rem; line-height: 1.6; color: var(--muted); }
  button { margin-top: 2rem; width: 100%; height: 2.5rem; border: 0; border-radius: 0.5rem;
    background: var(--accent); color: var(--paper); font: inherit; font-size: 0.875rem;
    font-weight: 500; cursor: pointer; }
  button:focus-visible { outline: 3px solid color-mix(in oklab, var(--accent) 45%, transparent); outline-offset: 2px; }
  .ref { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--line);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; }
`;

export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  const retry = unstable_retry ?? reset;
  return (
    <html lang="en">
      <body>
        <title>Foyer</title>
        <style>{PALETTE}</style>
        <div className="wrap">
          <div className="col">
            <h1>Foyer could not load</h1>
            <p>
              The application failed to start rendering. Nothing was changed.
              Reloading is usually enough; if it is not, the server log will
              have the matching entry.
            </p>
            <button type="button" onClick={() => retry()}>
              Reload Foyer
            </button>
            {error.digest && <p className="ref">Reference {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  );
}
