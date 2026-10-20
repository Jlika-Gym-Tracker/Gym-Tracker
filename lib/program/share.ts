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

import { z } from "zod";
import type { DayWithExercises } from "./queries";

export const SHARE_FORMAT = "jlika-week";
export const SHARE_VERSION = 1;

const MUSCLES = [
  "chest", "lats", "middle_back", "lower_back", "traps", "shoulders", "biceps",
  "triceps", "forearms", "quadriceps", "hamstrings", "glutes", "calves",
  "abdominals", "abductors", "adductors", "neck",
] as const;

const EQUIPMENT = [
  "barbell", "dumbbell", "machine", "cable", "body_only", "bands", "kettlebells",
  "ez_curl_bar", "exercise_ball", "medicine_ball", "foam_roll", "other",
] as const;

const sharedExercise = z.object({
  slug: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  primaryMuscle: z.enum(MUSCLES),
  equipment: z.enum(EQUIPMENT).catch("other"),
  tracking: z.enum(["reps", "time", "cardio"]).catch("reps"),
  targetSets: z.number().int().min(1).max(20),
  repMin: z.number().int().min(1).max(100).nullable(),
  repMax: z.number().int().min(1).max(100).nullable(),
  perSide: z.boolean().catch(false),
  note: z.string().trim().max(200).nullable().catch(null),
  targetSeconds: z.number().int().min(1).max(14400).nullable().catch(null),
  supersetGroup: z.number().int().min(1).max(9).nullable().catch(null),
  progression: z.enum(["off", "double", "linear", "greyskull", "time"]).nullable().catch(null),
});

const sharedDay = z.object({
  dayIndex: z.number().int().min(0).max(6),
  name: z.string().trim().min(1).max(40),
  focusNote: z.string().trim().max(300).nullable().catch(null),
  isRest: z.boolean(),
  progression: z.enum(["off", "double", "linear", "greyskull"]).catch("double"),
  exercises: z.array(sharedExercise).max(30),
});

export const sharedWeekSchema = z.object({
  format: z.literal(SHARE_FORMAT),
  version: z.literal(SHARE_VERSION),
  label: z.string().trim().min(1).max(80),
  days: z.array(sharedDay).max(7),
});

export type SharedWeek = z.infer<typeof sharedWeekSchema>;
export type SharedExercise = z.infer<typeof sharedExercise>;

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

export type ParseResult = { ok: true; week: SharedWeek } | { ok: false; error: string };

/** Reads a shared file, in words a person understands when it is not one. */
export function parseSharedWeek(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a shared week — it isn't even JSON." };
  }
  if (typeof raw !== "object" || raw === null || (raw as { format?: unknown }).format !== SHARE_FORMAT) {
    return { ok: false, error: "That file isn't a shared JLIKA week." };
  }
  if ((raw as { version?: unknown }).version !== SHARE_VERSION) {
    return { ok: false, error: "That week was shared from a newer version of the app." };
  }
  const parsed = sharedWeekSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "That week file is damaged or incomplete, so nothing was imported." };
  }
  const indexes = parsed.data.days.map((d) => d.dayIndex);
  if (new Set(indexes).size !== indexes.length) {
    return { ok: false, error: "That week lists the same day twice, so nothing was imported." };
  }
  return { ok: true, week: parsed.data };
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
