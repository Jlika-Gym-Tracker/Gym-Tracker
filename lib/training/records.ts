/**
 * Which sets of a finished session beat everything before them. Pure, so the
 * finish summary and its tests read the same rule.
 *
 * A record is one of:
 *   e1rm   a better estimated max (sets of 12 reps or fewer)
 *   load   a heavier bar than ever, when the set ran past the estimate's cap
 *   hold   a longer timed hold
 * A first-ever session sets a baseline, not a record — "PR" on everything the
 * first week is noise.
 */

import type { Tracking } from "@/lib/database.types";
import { bestSet, setOneRepMax } from "./e1rm";

export type RecordKind = "e1rm" | "load" | "hold";

export type SessionRecord = {
  exerciseId: string;
  name: string;
  kind: RecordKind;
  /** e1RM or load in kg, or seconds held. */
  value: number;
  previous: number;
  set: { weight_kg: number | null; reps: number | null; duration_s: number | null };
};

export type FinishedExercise = {
  id: string;
  name: string;
  tracking: Tracking;
  sets: { weight_kg: number | null; reps: number | null; duration_s: number | null }[];
};

export type PreviousBest = {
  bestSet: { weight_kg: number | null; reps: number | null } | null;
  heaviestKg: number;
  longestS: number;
};

export function sessionRecords(
  exercises: FinishedExercise[],
  bests: Map<string, PreviousBest>,
): SessionRecord[] {
  const records: SessionRecord[] = [];
  for (const ex of exercises) {
    const before = bests.get(ex.id);
    if (!before || ex.sets.length === 0) continue;

    if (ex.tracking === "time") {
      const top = [...ex.sets].sort((a, b) => (b.duration_s ?? 0) - (a.duration_s ?? 0))[0]!;
      const held = top.duration_s ?? 0;
      if (before.longestS > 0 && held > before.longestS) {
        records.push({ exerciseId: ex.id, name: ex.name, kind: "hold", value: held, previous: before.longestS, set: top });
      }
      continue;
    }
    if (ex.tracking !== "reps") continue;

    const top = bestSet(ex.sets);
    if (!top) continue;
    const e1rm = setOneRepMax(top);
    const previous = before.bestSet ? setOneRepMax(before.bestSet) : 0;
    if (e1rm > 0) {
      if (previous > 0 && e1rm > previous) {
        records.push({ exerciseId: ex.id, name: ex.name, kind: "e1rm", value: e1rm, previous, set: top });
      }
      continue;
    }
    const load = Number(top.weight_kg ?? 0);
    if (before.heaviestKg > 0 && load > before.heaviestKg) {
      records.push({ exerciseId: ex.id, name: ex.name, kind: "load", value: load, previous: before.heaviestKg, set: top });
    }
  }
  return records;
}
