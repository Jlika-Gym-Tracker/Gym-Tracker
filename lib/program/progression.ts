/**
 * Deciding next week's loads from what was logged.
 *
 * "Copy last week" used to duplicate the structure and leave the loads to you.
 * That is fine if you already know when to add weight; it is the whole question
 * if you do not. This runs each exercise's own progression rule — the same one
 * the session screen explains — so the advice you read on Monday is the number
 * you get next Monday.
 *
 * Pure: the caller supplies the rows and the history.
 */

import type { UnitSystem } from "@/lib/database.types";
import { prescribe, type PastSession, type PlanItem } from "./prescription";

export type PlannedExercise = PlanItem & {
  /** The program row this came from — one movement can sit on two days. */
  key: string;
  exerciseId: string;
  exerciseName: string;
};

export type ProgressionStatus =
  | "increase"
  | "hold"
  | "deload"
  | "unlogged"
  | "first_time"
  | "off";

export type ProgressionOutcome = {
  key: string;
  exerciseId: string;
  exerciseName: string;
  previousKg: number | null;
  nextKg: number | null;
  /** Next hold time for a timed movement; null leaves the plan's alone. */
  nextSeconds: number | null;
  /** One line explaining the decision, shown in the review list. */
  reason: string;
  status: ProgressionStatus;
};

export type ProgressWeekInput = {
  exercises: PlannedExercise[];
  /** Earlier sessions per exercise id, newest first, up to the end of the week being copied. */
  historyByExercise: Map<string, PastSession[]>;
  system?: UnitSystem;
};

export function progressWeek({
  exercises,
  historyByExercise,
  system = "metric",
}: ProgressWeekInput): ProgressionOutcome[] {
  return exercises.map((exercise) => {
    const history = historyByExercise.get(exercise.exerciseId) ?? [];
    const planned = exercise.plan?.target_weight_kg == null ? null : Number(exercise.plan.target_weight_kg);
    const p = prescribe(exercise, history, system);
    const common = {
      key: exercise.key,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
    };

    if (p.kind === "first") {
      // Nothing was ever logged, so there is nothing to judge. Carry the plan
      // across unchanged rather than inventing a step up from silence.
      return {
        ...common,
        previousKg: planned,
        nextKg: planned,
        nextSeconds: null,
        reason: planned == null ? "Never logged — pick a load at the gym." : "Not logged yet — same load again.",
        status: planned == null ? "first_time" : "unlogged",
      };
    }

    if (p.kind === "off") {
      return {
        ...common,
        previousKg: planned,
        nextKg: planned,
        nextSeconds: null,
        reason: p.why,
        status: "off",
      };
    }

    // Compare against what was actually lifted, not what was planned — the
    // plan may have said 60 while every set went in at 55.
    const latest = history[0];
    const lifted = latest ? Math.max(0, ...latest.sets.map((s) => Number(s.weight_kg ?? 0))) : 0;
    const previousKg = lifted > 0 ? lifted : planned;

    return {
      ...common,
      previousKg,
      nextKg: p.weightKg ?? planned,
      nextSeconds: p.seconds,
      reason: p.why,
      status: p.kind === "up" ? "increase" : p.kind === "deload" ? "deload" : "hold",
    };
  });
}

/** Summary line for the confirmation step. */
export function summariseProgression(outcomes: ProgressionOutcome[]): string {
  const count = (status: ProgressionStatus) => outcomes.filter((o) => o.status === status).length;
  const up = count("increase");
  const held = count("hold");
  const deload = count("deload");
  const untouched = count("unlogged") + count("first_time") + count("off");

  if (outcomes.length === 0) return "Nothing to carry forward.";
  if (up === 0 && held === 0 && deload === 0) {
    return "Nothing was logged, so loads are unchanged.";
  }

  const parts = [`${up} going up`, `${held} holding`];
  if (deload > 0) parts.push(`${deload} deloading`);
  if (untouched > 0) parts.push(`${untouched} untouched`);
  return parts.join(" · ");
}
