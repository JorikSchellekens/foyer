import { ImageResponse } from "next/og";

export const alt = "Foyer: share documents and data rooms, and see everything.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#fafaf8";
const INK = "#16181d";
const HAIRLINE = "#e7e6e0";
const GREEN = "#175b47";
const MUTED = "#6b6f76";

const WORDMARK = "Foyer";
const HEADLINE = "Share documents and data rooms.";
const SUBLINE = "See who read what, page by page.";
const FOOTER = "DATA ROOMS · LINKS · SIGNATURES · ANALYTICS";

/**
 * Newsreader, subset to the glyphs this card actually sets. Google serves
 * TrueType when the request carries no browser User-Agent, which is the only
 * outline format satori can parse. A build without network access is a real
 * possibility for a self-hosted app, so a failure falls back to next/og's own
 * face rather than failing the build.
 */
async function newsreader(
  axis: string,
  text: string
): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@${axis}&text=${encodeURIComponent(text)}`
    ).then((r) => (r.ok ? r.text() : ""));
    const url = /src:\s*url\((https:[^)]+)\)/.exec(css)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [italic, roman] = await Promise.all([
    newsreader("1,500", WORDMARK),
    newsreader("0,400", HEADLINE + SUBLINE + FOOTER),
  ]);
  // Half a typeface would read worse than none, so both or neither.
  const fonts =
    italic && roman
      ? ([
          { name: "Newsreader", data: italic, style: "italic", weight: 500 },
          { name: "Newsreader", data: roman, style: "normal", weight: 400 },
        ] as const)
      : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 76,
          background: PAPER,
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="96" height="96" viewBox="0 0 32 32" fill="none">
            <rect
              x="8.2"
              y="24"
              width="15.6"
              height="1.9"
              rx="0.95"
              fill={GREEN}
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M10 24.3 V14.6 A6 6 0 0 1 22 14.6 V24.3 H19.5 V15.2 A3.5 3.5 0 0 0 12.5 15.2 V24.3 Z"
              fill={GREEN}
            />
          </svg>
          <div
            style={{
              display: "flex",
              fontFamily: "Newsreader",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 62,
              letterSpacing: "-0.02em",
            }}
          >
            {WORDMARK}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Newsreader",
              fontSize: 74,
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
              maxWidth: 900,
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: MUTED }}>
            {SUBLINE}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            borderTop: `2px solid ${HAIRLINE}`,
            paddingTop: 26,
            fontSize: 20,
            letterSpacing: "0.14em",
            color: MUTED,
          }}
        >
          {FOOTER}
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts: [...fonts] } : {}) }
  );
}
