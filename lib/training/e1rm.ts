/**
 * Strength maths. Pure functions, unit-tested — every screen that shows a
 * number about lifting goes through here.
 */

export type CompletedSet = {
  weight_kg: number | null;
  reps: number | null;
  /** Optional — plenty of sets are logged without a rating. */
  rpe?: number | null;
};

/** Epley: weight × (1 + reps/30). A single rep is its own 1RM. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function setOneRepMax(set: CompletedSet): number {
  if (!set.weight_kg || !set.reps) return 0;
  return estimateOneRepMax(Number(set.weight_kg), set.reps);
}

/** The set with the highest estimated 1RM — not simply the heaviest. */
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
  return best;
}

/** Tonnage: Σ weight × reps. */
export function totalVolume(sets: CompletedSet[]): number {
  return sets.reduce(
    (sum, s) => sum + Number(s.weight_kg ?? 0) * (s.reps ?? 0),
    0,
  );
}

export type ProgressionHint = {
  headline: string;
  /** Suggested working load in kg, or null when there is nothing to go on. */
  suggestedKg: number | null;
};

function formatLoad(kg: number) {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

/**
 * Reads the last session's top set for a movement and suggests what to do next.
 *
 * The rule: if the top set reached the top of the prescribed range with reps
 * still in reserve (RPE <= 8), add load and drop back down the range.
 * Otherwise hold the load and chase reps. RPE is optional — without it we only
 * add load when the rep ceiling was beaten outright.
 */
export function progressionHint({
  lastSets,
  repMin,
  repMax,
  incrementKg = 2.5,
  unitLabel = "kg",
}: {
  lastSets: CompletedSet[];
  repMin: number | null;
  repMax: number | null;
  incrementKg?: number;
  unitLabel?: string;
}): ProgressionHint {
  const top = bestSet(lastSets);
  if (!top || !top.weight_kg || !top.reps) {
    return {
      headline:
        "First time logging this one. Pick a load you could stop two reps short of, and note how it felt.",
      suggestedKg: null,
    };
  }

  const load = Number(top.weight_kg);
  const reps = top.reps;
  const ceiling = repMax ?? repMin;
  const clearedRange = ceiling != null && reps >= ceiling;
  const hadReserve = top.rpe == null ? ceiling != null && reps > ceiling : top.rpe <= 8;

  if (clearedRange && hadReserve) {
    const bottom = repMin ?? ceiling!;
    return {
      headline: `You hit ${reps} reps at ${formatLoad(load)} ${unitLabel}${
        top.rpe != null ? ` at RPE ${top.rpe}` : ""
      }. Add ${incrementKg} ${unitLabel} and aim for ${bottom}–${Math.min(bottom + 2, ceiling!)}.`,
      suggestedKg: load + incrementKg,
    };
  }

  if (clearedRange) {
    return {
      headline: `You cleared the range at ${formatLoad(load)} ${unitLabel}, but it was close to failure. Repeat the load and own it.`,
      suggestedKg: load,
    };
  }

  return {
    headline: `Last time: ${formatLoad(load)} ${unitLabel} × ${reps}. Hold the load and add reps until you reach ${
      ceiling ?? "the top of your range"
    }.`,
    suggestedKg: load,
  };
}
