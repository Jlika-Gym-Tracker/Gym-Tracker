/**
 * Per-exercise strength curves: one estimated 1RM per session, from that
 * session's best set. Pure functions, unit-tested.
 */

import { estimateOneRepMax } from "./e1rm";

export type LiftSet = {
  sessionId: string;
  /** The day the session started, yyyy-MM-dd. */
  date: string;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
};

export type LiftPoint = {
  sessionId: string;
  date: string;
  e1rmKg: number;
  /** The set the estimate came from. */
  weightKg: number;
  reps: number;
  rpe: number | null;
};

export type LiftSeries = {
  exerciseId: string;
  name: string;
  /** Sessions the exercise was logged in, estimable or not. */
  sessions: number;
  /** Oldest first. */
  points: LiftPoint[];
};

/**
 * Every exercise with at least one estimable session, most-trained first.
 *
 * estimateOneRepMax answers 0 when it will not guess — nothing lifted, or
 * more reps than an estimate can be trusted from — so a 0 is "no estimate",
 * never a data point, and a session whose every set is like that is skipped.
 */
export function liftSeries(
  sets: readonly LiftSet[],
  names: ReadonlyMap<string, string>,
): LiftSeries[] {
  const byExercise = new Map<string, Map<string, LiftSet[]>>();
  for (const set of sets) {
    const sessions = byExercise.get(set.exerciseId) ?? new Map<string, LiftSet[]>();
    sessions.set(set.sessionId, [...(sessions.get(set.sessionId) ?? []), set]);
    byExercise.set(set.exerciseId, sessions);
  }

  const series: LiftSeries[] = [];
  for (const [exerciseId, sessions] of byExercise) {
    const points: LiftPoint[] = [];
    for (const [sessionId, sessionSets] of sessions) {
      const best = bestEstimate(sessionSets);
      if (best) points.push({ sessionId, ...best });
    }
    if (points.length === 0) continue;
    points.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
    series.push({
      exerciseId,
      name: names.get(exerciseId) ?? "Exercise",
      sessions: sessions.size,
      points,
    });
  }

  return series.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

function bestEstimate(sets: LiftSet[]): Omit<LiftPoint, "sessionId"> | null {
  let best: Omit<LiftPoint, "sessionId"> | null = null;
  for (const set of sets) {
    const weightKg = Number(set.weightKg ?? 0);
    const reps = set.reps ?? 0;
    const e1rmKg = estimateOneRepMax(weightKg, reps);
    if (e1rmKg > 0 && (!best || e1rmKg > best.e1rmKg)) {
      best = { date: set.date, e1rmKg, weightKg, reps, rpe: set.rpe };
    }
  }
  return best;
}
