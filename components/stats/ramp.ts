/*
  The stats cards' "more" scale, from accent-deep to the accent itself. Built
  as a CSS color-mix so it follows the account's accent colour; every place it
  is used sets it through style (background, fill), where CSS functions and
  variables resolve.
*/

/** A colour from accent-deep (t = 0) to accent (t = 1). */
export function accentRamp(t: number): string {
  const k = Math.min(1, Math.max(0, t));
  return `color-mix(in oklab, var(--accent) ${Math.round(k * 100)}%, var(--accent-deep))`;
}
