/** A six-digit hex colour, the only form the branding fields accept. */
export const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Ink or paper, whichever stays readable on the given surface.
 *
 * Uses the perceptual weighting from the W3C's brightness formula rather than
 * a raw average, because the eye reads green as far brighter than blue: a flat
 * mean puts white text on a mid-green that is already too light for it. The
 * threshold sits at 150 rather than the midpoint so mid-tones tip to dark ink,
 * which is the safer miss of the two - dark text on a slightly dim background
 * is merely a little low-contrast, while white text on a slightly light one is
 * unreadable.
 *
 * Malformed input falls back to ink, so a half-typed colour in the branding
 * form never flashes white-on-white.
 *
 * This is the single definition shared by the viewer gates, the branding
 * preview and the custom-domain front page, so all three land on the same
 * decision for the same colour.
 */
export function contrastText(hex: string): string {
  if (!HEX.test(hex)) return "#16181d";
  const n = hex.slice(1);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#16181d" : "#ffffff";
}
