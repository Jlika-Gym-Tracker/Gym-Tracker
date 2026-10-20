/**
 * The accent colours an account can pick. Every one is light enough for the
 * dark (#0a0c0d) label the accent buttons already use — at least 8:1 contrast —
 * so switching never makes a button unreadable. Tints are derived in
 * app/globals.css from the accent itself.
 */

export const ACCENTS = [
  { key: "lime", label: "Lime", hex: "#c9f24d" },
  { key: "orange", label: "Orange", hex: "#ffb35c" },
  { key: "yellow", label: "Yellow", hex: "#ffd84d" },
  { key: "coral", label: "Coral", hex: "#ff9a85" },
  { key: "pink", label: "Pink", hex: "#ff9ccf" },
  { key: "violet", label: "Violet", hex: "#bfadff" },
  { key: "sky", label: "Sky", hex: "#78ccff" },
  { key: "mint", label: "Mint", hex: "#66e8c6" },
] as const;

export type Accent = (typeof ACCENTS)[number]["key"];

export const DEFAULT_ACCENT: Accent = "lime";

/** Cookie the <head> script reads, so the colour is right before first paint. */
export const ACCENT_COOKIE = "jlika-accent";

export function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && ACCENTS.some((a) => a.key === value);
}

/**
 * Runs in <head> before the page paints: applies the saved accent so lime
 * never flashes first. Inline and tiny on purpose; it only ever writes a
 * known key onto <html>.
 */
export const ACCENT_BOOT_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${ACCENT_COOKIE}=([a-z]+)/);if(m&&${JSON.stringify(
  ACCENTS.map((a) => a.key),
)}.indexOf(m[1])>-1)document.documentElement.setAttribute("data-accent",m[1])}catch(e){}`;
