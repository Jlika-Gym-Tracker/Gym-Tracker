/**
 * Reading a shared week file. Kept apart from share.ts so the zod it needs
 * stays on the server; the file is never trusted.
 */

import { z } from "zod";
import { SHARE_FORMAT, SHARE_VERSION, type SharedWeek } from "./share";

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

const sharedWeekSchema = z.object({
  format: z.literal(SHARE_FORMAT),
  version: z.literal(SHARE_VERSION),
  label: z.string().trim().min(1).max(80),
  days: z.array(sharedDay).max(7),
});

// Fails to compile if the schema and the hand-written type drift apart.
const _matches: z.infer<typeof sharedWeekSchema> extends SharedWeek
  ? SharedWeek extends z.infer<typeof sharedWeekSchema>
    ? true
    : never
  : never = true;
void _matches;

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

