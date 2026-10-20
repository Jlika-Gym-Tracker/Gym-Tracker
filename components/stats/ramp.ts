/*
  Hex rather than tokens, like the charts: these colours are computed per data
  point, and mixing two colours is simpler here than in CSS.
*/
const LOW = [0x3f, 0x53, 0x20] as const; // --accent-deep
const HIGH = [0xc9, 0xf2, 0x4d] as const; // --accent

/** A colour from accent-deep (t = 0) to accent (t = 1): the stats cards' "more" scale. */
export function limeRamp(t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const channel = (i: 0 | 1 | 2) =>
    Math.round(LOW[i] + (HIGH[i] - LOW[i]) * k)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}
