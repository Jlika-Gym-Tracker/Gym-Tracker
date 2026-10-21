/**
 * Strength maths. Pure functions, unit-tested — every screen that shows a
 * number about lifting goes through here. What to lift next lives in
 * lib/program/prescription.ts.
 */

export type CompletedSet = {
  weight_kg: number | null;
  reps: number | null;
  /** Optional — plenty of sets are logged without a rating. */
  rpe?: number | null;
};

/**
 * Above this many reps an estimate says more about work capacity than about
 * maximal strength, and the usual formulas disagree by double digits. Refusing
 * to guess beats printing a fantasy number.
 */
export const E1RM_REP_CAP = 12;

/**
 * Epley: weight × (1 + reps/30). A single rep is its own 1RM — a measurement,
 * not an estimate. Returns 0 for anything it cannot honestly answer, including
 * sets past E1RM_REP_CAP.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return 0;
  if (weightKg <= 0 || reps <= 0 || reps > E1RM_REP_CAP) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + Math.round(reps) / 30);
}

export function setOneRepMax(set: CompletedSet): number {
  if (!set.weight_kg || !set.reps) return 0;
  return estimateOneRepMax(Number(set.weight_kg), set.reps);
}

/**
 * The set that best represents the day: the highest estimated 1RM, not simply
 * the heaviest bar. When nothing qualifies for an estimate (every set ran past
 * the rep cap), the heaviest load wins, then the most reps — a session of
 * twenty-rep calf raises still has a top set.
 */
export function bestSet<T extends CompletedSet>(sets: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const set of sets) {
    const score = setOneRepMax(set);
    if (score > bestScore) {
      bestScore = score;
      best = set;
    }
  }
  if (best) return best;

  for (const set of sets) {
    const weight = Number(set.weight_kg ?? 0);
    const reps = set.reps ?? 0;
    if (weight <= 0 || reps <= 0) continue;
    const top = best ? Number(best.weight_kg ?? 0) : -1;
    if (!best || weight > top || (weight === top && reps > (best.reps ?? 0))) best = set;
  }
  return best;
}

/** Tonnage: Σ weight × reps. */
export function totalVolume(sets: CompletedSet[]): number {
  return sets.reduce(
    (sum, s) => sum + Number(s.weight_kg ?? 0) * (s.reps ?? 0),
    0,
  );
}
