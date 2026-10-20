/**
 * A week as a small file you can hand to someone.
 *
 * It carries the routine — days, exercises, sets, reps, holds, supersets and
 * rules — and nothing about the person who wrote it: no logged sets, no
 * weigh-ins, and no planned loads, because 100 kg is your number, not theirs.
 *
 * Exercises travel by slug with their name, muscle and equipment alongside, so
 * a library movement lands on the same row and someone's own movement can be
 * recreated on the other end. Pure: parsing never trusts the file.
 */

import type { DayWithExercises } from "./queries";
import type { DayProgression, Equipment, Muscle, ProgressionPolicy, Tracking } from "@/lib/database.types";

export const SHARE_FORMAT = "jlika-week";
export const SHARE_VERSION = 1;

// Written out rather than inferred from the parser's zod schema, so building a
// file in the browser does not ship zod; share-parse.ts checks it matches.
export type SharedExercise = {
  slug: string;
  name: string;
  primaryMuscle: Muscle;
  equipment: Equipment;
  tracking: Tracking;
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  perSide: boolean;
  note: string | null;
  targetSeconds: number | null;
  supersetGroup: number | null;
  progression: ProgressionPolicy | null;
};

export type SharedDay = {
  dayIndex: number;
  name: string;
  focusNote: string | null;
  isRest: boolean;
  progression: DayProgression;
  exercises: SharedExercise[];
};

export type SharedWeek = {
  format: typeof SHARE_FORMAT;
  version: typeof SHARE_VERSION;
  label: string;
  days: SharedDay[];
};

export function toSharedWeek(label: string, days: DayWithExercises[]): SharedWeek {
  return {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    label,
    days: [...days]
      .sort((a, b) => a.day_index - b.day_index)
      .map((day) => ({
        dayIndex: day.day_index,
        name: day.name,
        focusNote: day.focus_note,
        isRest: day.is_rest,
        progression: day.progression ?? "double",
        exercises: [...day.exercises]
          .sort((a, b) => a.position - b.position)
          .map((item) => ({
            slug: item.exercise.slug,
            name: item.exercise.name,
            primaryMuscle: item.exercise.primary_muscle,
            equipment: item.exercise.equipment,
            tracking: item.exercise.tracking ?? "reps",
            targetSets: item.target_sets,
            repMin: item.rep_min,
            repMax: item.rep_max,
            perSide: item.per_side,
            note: item.note,
            targetSeconds: item.target_seconds,
            supersetGroup: item.superset_group,
            progression: item.progression,
          })),
      })),
  };
}

export type MergePlan = {
  /** Days that will be written, from the file. */
  fill: SharedWeek["days"];
  /** Day indexes skipped because the receiving week already has a plan there. */
  kept: number[];
};

/**
 * Importing merges: a day the receiving week already has exercises on is left
 * alone, so a shared plan can never overwrite yours. Rest days in the file
 * only fill days that are empty too.
 */
export function planMerge(
  incoming: SharedWeek,
  existing: { day_index: number; exerciseCount: number }[],
): MergePlan {
  const busy = new Set(existing.filter((d) => d.exerciseCount > 0).map((d) => d.day_index));
  const fill: SharedWeek["days"] = [];
  const kept: number[] = [];
  for (const day of incoming.days) {
    if (busy.has(day.dayIndex)) {
      if (day.exercises.length > 0) kept.push(day.dayIndex);
      continue;
    }
    fill.push(day);
  }
  return { fill, kept };
}

export function shareFileName(label: string, weekStart: string) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "week"}-${weekStart}.jlika-week.json`;
}
