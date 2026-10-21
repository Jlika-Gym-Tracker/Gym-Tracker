/**
 * One movement's history, summarised for its page: the best set, the longest
 * hold, the estimated-1RM curve and the last few sessions. Pure functions over
 * completed sets, unit-tested; the queries live in ./queries.ts.
 */

import { bestSet, estimateOneRepMax } from "@/lib/training/e1rm";
import { liftSeries, type LiftPoint } from "@/lib/training/lift-progress";

export type ExerciseSet = {
  sessionId: string;
  /** When the session started (ISO timestamp). */
  startedAt: string;
  /** The day it started, yyyy-MM-dd — what the curve and the list are dated by. */
  date: string;
  sessionTitle: string | null;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  durationS: number | null;
  distanceM: number | null;
};

export type ExerciseSession = {
  sessionId: string;
  date: string;
  title: string | null;
  /** In the order they were done. */
  sets: ExerciseSet[];
};

export type ExerciseStats = {
  sessions: number;
  sets: number;
  /** Best estimated 1RM, or the heaviest set when nothing is estimable. */
  bestSet: { weightKg: number; reps: number } | null;
  /** 0 when the best set is past the rep cap. */
  e1rmKg: number;
  heaviestKg: number;
  /** Longest hold or cardio session, seconds. */
  longestS: number;
  /** Farthest single cardio entry, metres. */
  farthestM: number;
  /** Estimated 1RM per session, oldest first. Empty for timed and cardio work. */
  curve: LiftPoint[];
  /** Newest first. */
  recent: ExerciseSession[];
};

export function exerciseStats(sets: readonly ExerciseSet[], recentSessions = 5): ExerciseStats {
  const top = bestSet(sets.map((s) => ({ ...s, weight_kg: s.weightKg, reps: s.reps })));

  const bySession = new Map<string, ExerciseSession>();
  for (const set of sets) {
    const entry = bySession.get(set.sessionId) ?? {
      sessionId: set.sessionId,
      date: set.date,
      title: set.sessionTitle,
      sets: [],
    };
    entry.sets.push(set);
    bySession.set(set.sessionId, entry);
  }
  const startedAt = new Map(sets.map((s) => [s.sessionId, s.startedAt]));
  const recent = [...bySession.values()]
    .sort((a, b) => startedAt.get(b.sessionId)!.localeCompare(startedAt.get(a.sessionId)!))
    .slice(0, recentSessions)
    .map((session) => ({ ...session, sets: [...session.sets].sort((a, b) => a.setIndex - b.setIndex) }));

  const [series] = liftSeries(
    sets.map((s) => ({
      sessionId: s.sessionId,
      date: s.date,
      exerciseId: "this",
      weightKg: s.weightKg,
      reps: s.reps,
      rpe: s.rpe,
    })),
    new Map(),
  );

  return {
    sessions: bySession.size,
    sets: sets.length,
    bestSet:
      top && top.weightKg != null && top.reps != null && top.weightKg > 0 && top.reps > 0
        ? { weightKg: top.weightKg, reps: top.reps }
        : null,
    e1rmKg: top?.weightKg && top.reps ? estimateOneRepMax(top.weightKg, top.reps) : 0,
    heaviestKg: Math.max(0, ...sets.map((s) => s.weightKg ?? 0)),
    longestS: Math.max(0, ...sets.map((s) => s.durationS ?? 0)),
    farthestM: Math.max(0, ...sets.map((s) => s.distanceM ?? 0)),
    curve: series?.points ?? [],
    recent,
  };
}
