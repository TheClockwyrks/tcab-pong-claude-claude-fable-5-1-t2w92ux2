// Carom — the look: every color and type choice the renderer draws with.

/** The field background; also the color the letterbox bars are cleared to. */
export const FIELD_COLOR = "#0a0e1a";

export const COLORS = {
  field: FIELD_COLOR,
  fieldEdge: "#1b2238",
  net: "#2c3654",
  leftPaddle: "#3ee6c7",
  rightPaddle: "#ff5e9c",
  ball: "#fff3c4",
  ballGlow: "rgba(255, 243, 196, 0.35)",
  obstacle: "#ffb347",
  obstacleEdge: "#ffd58a",
  trail: "#fff3c4",
  text: "#e8ecf7",
  textDim: "#7f8aab",
  accent: "#ffb347",
  menuHighlight: "rgba(255, 179, 71, 0.18)",
  menuHighlightEdge: "#ffb347",
  overlay: "rgba(5, 8, 16, 0.72)",
  dim: "rgba(10, 14, 26, 0.6)",
} as const;

export const FONT_FAMILY =
  '"Trebuchet MS", "DejaVu Sans", "Segoe UI", Helvetica, Arial, sans-serif';

/** A font shorthand at `px` pixels, bold when asked. */
export function font(px: number, weight: "bold" | "normal" = "normal"): string {
  return `${weight === "bold" ? "bold " : ""}${px}px ${FONT_FAMILY}`;
}
