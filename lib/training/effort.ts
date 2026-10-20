/**
 * How hard a set was, in whichever scale you think in.
 *
 * Every set stores RPE (set_logs.rpe). RIR — reps left in the tank — is the
 * same judgement read the other way: RIR = 10 − RPE. Converting at the display
 * edge means switching scale never rewrites a logged set, and a history that
 * mixes both still aggregates as one series.
 */

import type { EffortScale } from "@/lib/database.types";

export type { EffortScale };

/** At or below this many reps in reserve a set counts as hard (RPE ≥ 7). */
export const HARD_RIR = 3;

/** Fewer rated sets than this and an average is one tap, not a finding. */
export const MIN_RATED = 5;

export const EFFORT_LABEL: Record<Exclude<EffortScale, "off">, string> = {
  rpe: "RPE",
  rir: "RIR",
};

export const EFFORT_DESCRIPTION: Record<EffortScale, string> = {
  off: "No effort column. Progression works from weight and reps alone.",
  rpe: "Rate of perceived exertion, 1–10. RPE 10 is a set taken to failure.",
  rir: "Reps in reserve: how many more you could have done. 0 is failure.",
};

export function rpeToRir(rpe: number): number {
  return round1(10 - rpe);
}

export function rirToRpe(rir: number): number {
  return round1(10 - rir);
}

/** A stored RPE as the number this user reads, or null when unrated. */
export function toScale(rpe: number | null | undefined, scale: EffortScale): number | null {
  if (rpe == null || scale === "off") return null;
  return scale === "rir" ? rpeToRir(Number(rpe)) : round1(Number(rpe));
}

/**
 * A typed value in the user's scale, back to the RPE that is stored. Returns
 * null for blanks and for anything outside what the column accepts.
 */
export function fromScale(value: number | null, scale: EffortScale): number | null {
  if (value == null || Number.isNaN(value) || scale === "off") return null;
  const rpe = scale === "rir" ? rirToRpe(value) : value;
  return rpe >= 1 && rpe <= 10 ? round1(rpe) : null;
}

/** A set's effort in RIR — the internal unit for statistics — or null. */
export function rirOf(rpe: number | null | undefined): number | null {
  return rpe == null ? null : rpeToRir(Number(rpe));
}

export function isHardSet(rpe: number | null | undefined): boolean {
  const rir = rirOf(rpe);
  return rir != null && rir <= HARD_RIR;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
