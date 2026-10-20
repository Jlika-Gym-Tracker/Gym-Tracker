/**
 * The shapes the AI Coach trades in: what the intake asks, what the model may
 * answer, and how a week is held while it is being changed.
 *
 * The model's answers are constrained twice. The JSON schema derived from
 * these zod objects goes out as structured output, so the reply is at least
 * well-formed; then the same zod objects check it again on the way in, with
 * the numeric bounds the API's schema dialect cannot express. Neither of those
 * knows the person's library or plan — lib/ai-coach/plan.ts and changes.ts do,
 * and they are the real boundary.
 */

import { z } from "zod";
import type {
  AiCoachChangeType,
  DayProgression,
  Equipment,
  Goal,
  Muscle,
  ProgressionPolicy,
  Tracking,
  WeekStatus,
} from "@/lib/database.types";

// ------------------------------------------------------------------ intake

export const GOALS = ["cut", "bulk", "recomp", "strength", "health"] as const satisfies readonly Goal[];

export const EXPERIENCE = ["new", "some", "experienced"] as const;
export type Experience = (typeof EXPERIENCE)[number];

export const EXPERIENCE_LABEL: Record<Experience, { name: string; detail: string }> = {
  new: { name: "New", detail: "Under six months of regular lifting" },
  some: { name: "Some", detail: "Six months to two years" },
  experienced: { name: "Experienced", detail: "Two years or more" },
};

export const EQUIPMENT = [
  "barbell", "dumbbell", "machine", "cable", "body_only", "bands", "kettlebells",
  "ez_curl_bar", "exercise_ball", "medicine_ball", "foam_roll", "other",
] as const satisfies readonly Equipment[];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbells",
  machine: "Machines",
  cable: "Cables",
  body_only: "Bodyweight",
  bands: "Bands",
  kettlebells: "Kettlebells",
  ez_curl_bar: "EZ bar",
  exercise_ball: "Exercise ball",
  medicine_ball: "Medicine ball",
  foam_roll: "Foam roller",
  other: "Other kit",
};

export const SESSION_LENGTHS = [30, 45, 60, 75, 90] as const;

export const intakeSchema = z.object({
  goal: z.enum(GOALS),
  experience: z.enum(EXPERIENCE),
  daysPerWeek: z.number().int().min(1).max(7),
  /** Week positions (0 = the first day of the user's week) they would rather train on. */
  preferredDays: z.array(z.number().int().min(0).max(6)).max(7),
  sessionMinutes: z.number().int().min(20).max(180),
  equipment: z.array(z.enum(EQUIPMENT)).min(1).max(EQUIPMENT.length),
  limitations: z.string().trim().max(500),
  likes: z.string().trim().max(300),
  dislikes: z.string().trim().max(300),
  /** Off by default: sex, age and height are only sent when this is on. */
  shareBodyDetails: z.boolean(),
});

export type Intake = z.infer<typeof intakeSchema>;

// ------------------------------------------------------------- the library

/** One movement the model may choose, as the AI Coach holds it. */
export type CatalogEntry = {
  id: string;
  slug: string;
  name: string;
  primary_muscle: Muscle;
  secondary_muscles: string[];
  equipment: Equipment;
  tracking: Tracking;
  /**
   * Offered to the model for new picks: featured movements and the person's
   * own, not removed. False keeps the long tail of the library out of the
   * prompt while it can still be read and checked when a plan already uses
   * it. Absent counts as offered.
   */
  offered?: boolean;
};

// ------------------------------------------------------- the model's answers

const DAY_PROGRESSIONS = ["double", "linear", "greyskull", "off"] as const satisfies readonly DayProgression[];
const POLICIES = ["double", "linear", "greyskull", "off", "time"] as const satisfies readonly ProgressionPolicy[];

const dayIndex = z.number().int().min(0).max(6);
const slug = z.string().min(1).max(80).describe("A slug copied exactly from the catalog.");
const rationale = z
  .string()
  .min(1)
  .max(500)
  .describe("Why, citing the numbers in the evidence that justify it. One or two sentences.");
const why = z
  .string()
  .min(1)
  .max(300)
  .describe("One sentence, in the second person, on why this exercise is in the plan.");

export const planExerciseSchema = z.object({
  slug,
  sets: z.number().int().min(1).max(10),
  rep_min: z.number().int().min(1).max(100).nullable(),
  rep_max: z.number().int().min(1).max(100).nullable(),
  target_seconds: z.number().int().min(5).max(7200).nullable(),
  per_side: z.boolean(),
  superset: z.number().int().min(1).max(9).nullable(),
  progression: z.enum(POLICIES).nullable(),
  why,
});

export const planDaySchema = z.object({
  day_index: dayIndex,
  name: z.string().min(1).max(60),
  focus_note: z.string().max(400).nullable(),
  rest: z.boolean(),
  progression: z.enum(DAY_PROGRESSIONS),
  exercises: z.array(planExerciseSchema).max(14),
});

export const planOutputSchema = z.object({
  label: z.string().min(1).max(120).describe("A short name for the week."),
  summary: z.string().min(1).max(1200).describe("Two or three sentences on how the week is built."),
  days: z.array(planDaySchema).min(1).max(7),
});

export type PlanOutput = z.infer<typeof planOutputSchema>;
export type PlanExerciseOutput = z.infer<typeof planExerciseSchema>;

// The closed set of changes a review may propose. Each names its target by the
// day's position and the exercise's slug, never by a database id.

const target = { day_index: dayIndex, exercise: slug };

const swapExercise = z.object({
  type: z.literal("swap_exercise"),
  ...target,
  to_exercise: slug,
  why,
  rationale,
});
const addExercise = z.object({
  type: z.literal("add_exercise"),
  day_index: dayIndex,
  exercise: slug,
  after_exercise: slug.nullable().describe("Insert after this exercise of the day; null = at the end."),
  sets: z.number().int().min(1).max(10),
  rep_min: z.number().int().min(1).max(100).nullable(),
  rep_max: z.number().int().min(1).max(100).nullable(),
  target_seconds: z.number().int().min(5).max(7200).nullable(),
  per_side: z.boolean(),
  superset: z.number().int().min(1).max(9).nullable(),
  why,
  rationale,
});
const removeExercise = z.object({ type: z.literal("remove_exercise"), ...target, rationale });
const setSets = z.object({
  type: z.literal("set_sets"),
  ...target,
  sets: z.number().int().min(1).max(10),
  rationale,
});
const setRepRange = z.object({
  type: z.literal("set_rep_range"),
  ...target,
  rep_min: z.number().int().min(1).max(100),
  rep_max: z.number().int().min(1).max(100),
  rationale,
});
const setTargetSeconds = z.object({
  type: z.literal("set_target_seconds"),
  ...target,
  target_seconds: z.number().int().min(5).max(7200),
  rationale,
});
const setLoad = z.object({
  type: z.literal("set_load"),
  ...target,
  load_kg: z.number().min(0).max(1000).nullable().describe("Planned load in kg; null clears it."),
  rationale,
});
const setProgression = z.object({
  type: z.literal("set_progression"),
  day_index: dayIndex,
  exercise: slug.nullable().describe("null sets the day's rule; a slug sets that exercise's override."),
  progression: z.enum(POLICIES).nullable().describe("null clears an exercise override."),
  rationale,
});
const setSuperset = z.object({
  type: z.literal("set_superset"),
  ...target,
  superset: z.number().int().min(1).max(9).nullable(),
  rationale,
});
const renameDay = z.object({
  type: z.literal("rename_day"),
  day_index: dayIndex,
  name: z.string().min(1).max(60),
  focus_note: z.string().max(400).nullable(),
  rationale,
});

export const changeSchema = z.discriminatedUnion("type", [
  swapExercise,
  addExercise,
  removeExercise,
  setSets,
  setRepRange,
  setTargetSeconds,
  setLoad,
  setProgression,
  setSuperset,
  renameDay,
]);

export type Change = z.infer<typeof changeSchema>;

export const CHANGE_TYPES = [
  "swap_exercise", "add_exercise", "remove_exercise", "set_sets", "set_rep_range",
  "set_target_seconds", "set_load", "set_progression", "set_superset", "rename_day",
] as const satisfies readonly AiCoachChangeType[];

export const MAX_CHANGES = 12;

export const reviewOutputSchema = z.object({
  summary: z.string().min(1).max(1200).describe("What the evidence says, in two or three sentences."),
  changes: z.array(changeSchema).max(MAX_CHANGES),
  advice: z
    .array(z.string().min(1).max(400))
    .max(6)
    .describe("Observations that change nothing in the plan."),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

// ------------------------------------------------------------------- weeks

/**
 * A week as it is held while being changed, and as a snapshot stores it.
 * Ids are kept when the rows exist, so Revert can put back the very rows an
 * apply replaced; a target the AI Coach produced has none until written.
 */
export const snapshotExerciseSchema = z.object({
  id: z.string().nullable(),
  exercise_id: z.string(),
  position: z.number().int(),
  target_sets: z.number().int().min(1).max(20),
  rep_min: z.number().int().nullable(),
  rep_max: z.number().int().nullable(),
  per_side: z.boolean(),
  note: z.string().nullable(),
  target_weight_kg: z.number().nullable(),
  superset_group: z.number().int().nullable(),
  target_seconds: z.number().int().nullable(),
  progression: z.enum(POLICIES).nullable(),
  increment_kg: z.number().nullable(),
});

export const snapshotDaySchema = z.object({
  id: z.string().nullable(),
  day_index: dayIndex,
  name: z.string(),
  focus_note: z.string().nullable(),
  is_rest: z.boolean(),
  progression: z.enum(DAY_PROGRESSIONS),
  exercises: z.array(snapshotExerciseSchema),
});

export const weekSnapshotSchema = z.object({
  week: z
    .object({
      id: z.string().nullable(),
      label: z.string(),
      status: z.enum(["draft", "published", "archived"] as const satisfies readonly WeekStatus[]),
      notes: z.string().nullable(),
    })
    .nullable(),
  days: z.array(snapshotDaySchema),
});

export type SnapshotExercise = z.infer<typeof snapshotExerciseSchema>;
export type SnapshotDay = z.infer<typeof snapshotDaySchema>;
export type WeekSnapshot = z.infer<typeof weekSnapshotSchema>;
