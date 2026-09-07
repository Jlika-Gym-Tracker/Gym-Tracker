/**
 * Deciding next week's loads from last week's sets.
 *
 * "Copy last week" used to duplicate the structure and leave the loads to you.
 * That is fine if you already know when to add weight; it is the whole question
 * if you do not. This applies the same rule the session screen shows as a hint,
 * so the advice you read on Monday is the number you get next Monday.
 *
 * Pure: the caller supplies the rows.
 */

import { bestSet, progressionHint, type CompletedSet } from "@/lib/training/e1rm";

export type PlannedExercise = {
  exerciseId: string;
  exerciseName: string;
  repMin: number | null;
  repMax: number | null;
  /** What last week planned, if anything. */
  targetWeightKg: number | null;
};

export type ProgressionOutcome = {
  exerciseId: string;
  exerciseName: string;
  previousKg: number | null;
  nextKg: number | null;
  /** One line explaining the decision, shown in the review list. */
  reason: string;
  status: "increase" | "hold" | "unlogged" | "first_time";
};

export type ProgressWeekInput = {
  exercises: PlannedExercise[];
  /** Completed sets logged for each exercise during the week being copied. */
  setsByExercise: Map<string, CompletedSet[]>;
  incrementKg?: number;
  unitLabel?: string;
};

function round(kg: number) {
  // Gyms have 1.25 kg plates at best; anything finer is fiction.
  return Math.round(kg * 4) / 4;
}

export function progressWeek({
  exercises,
  setsByExercise,
  incrementKg = 2.5,
  unitLabel = "kg",
}: ProgressWeekInput): ProgressionOutcome[] {
  return exercises.map((exercise) => {
    const sets = setsByExercise.get(exercise.exerciseId) ?? [];
    const logged = sets.filter((s) => s.weight_kg != null && s.reps != null);

    if (logged.length === 0) {
      // Nothing was logged, so there is nothing to judge. Carry the plan across
      // unchanged rather than inventing a step up from silence.
      return {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        previousKg: exercise.targetWeightKg,
        nextKg: exercise.targetWeightKg,
        reason:
          exercise.targetWeightKg == null
            ? "Never logged — pick a load at the gym."
            : "Not logged last week — same load again.",
        status: exercise.targetWeightKg == null ? "first_time" : "unlogged",
      };
    }

    const hint = progressionHint({
      lastSets: logged,
      repMin: exercise.repMin,
      repMax: exercise.repMax,
      incrementKg,
      unitLabel,
    });

    const top = bestSet(logged);
    const performedKg = top?.weight_kg == null ? null : Number(top.weight_kg);
    const nextKg = hint.suggestedKg == null ? performedKg : round(hint.suggestedKg);
    // Compare against what was actually lifted, not what was planned — the plan
    // may have said 60 while every set went in at 55.
    const increased = nextKg != null && performedKg != null && nextKg > performedKg;

    return {
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      previousKg: performedKg,
      nextKg,
      reason: hint.headline,
      status: increased ? "increase" : "hold",
    };
  });
}

/** Summary line for the confirmation step. */
export function summariseProgression(outcomes: ProgressionOutcome[]): string {
  const up = outcomes.filter((o) => o.status === "increase").length;
  const held = outcomes.filter((o) => o.status === "hold").length;
  const untouched = outcomes.filter(
    (o) => o.status === "unlogged" || o.status === "first_time",
  ).length;

  if (outcomes.length === 0) return "Nothing to carry forward.";
  if (up === 0 && held === 0) return "Nothing was logged last week, so loads are unchanged.";

  const parts = [`${up} going up`, `${held} holding`];
  if (untouched > 0) parts.push(`${untouched} untouched`);
  return parts.join(" · ");
}
