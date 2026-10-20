/**
 * Checking a drafted week against the person's library and intake, and
 * turning it into a week that can be written.
 *
 * This is where the model's answer stops being trusted text. Every exercise
 * must be a slug from the catalog it was shown (which was already filtered to
 * the equipment they have); every prescription must fit how that movement is
 * logged; every progression override must be one the movement can use. What
 * fails comes back as a list of plain sentences, which is what the repair
 * round sends to the model and, if that fails too, what the log records.
 *
 * Cosmetic slips — an over-long note, a one-member superset, a redundant
 * override — are fixed here rather than costing a repair round.
 */

import { z } from "zod";
import { POLICIES_FOR, effectivePolicy } from "@/lib/program/policies";
import type { DayProgression, Muscle, ProgressionPolicy, Tracking } from "@/lib/database.types";
import type { CatalogEntry, Intake, PlanOutput, WeekSnapshot } from "./schemas";

export type PlannedExercise = {
  exercise_id: string;
  slug: string;
  name: string;
  tracking: Tracking;
  primary_muscle: Muscle;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  target_seconds: number | null;
  per_side: boolean;
  superset_group: number | null;
  progression: ProgressionPolicy | null;
  note: string;
};

export type PlannedDay = {
  day_index: number;
  name: string;
  focus_note: string | null;
  is_rest: boolean;
  progression: DayProgression;
  exercises: PlannedExercise[];
};

export type ValidPlan = { label: string; summary: string; days: PlannedDay[] };

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Database limits the program builder also enforces. */
export const LIMITS = { label: 80, dayName: 40, focusNote: 300, note: 200, summary: 1200 } as const;

export function clip(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function validatePlan(
  output: PlanOutput,
  catalog: CatalogEntry[],
  intake: Pick<Intake, "daysPerWeek">,
): Checked<ValidPlan> {
  const errors: string[] = [];
  const bySlug = new Map(catalog.map((entry) => [entry.slug, entry]));
  const seen = new Set<number>();

  for (const day of output.days) {
    if (seen.has(day.day_index)) errors.push(`day_index ${day.day_index} appears more than once.`);
    seen.add(day.day_index);
  }

  const days: PlannedDay[] = [];
  for (let index = 0; index < 7; index++) {
    const day = output.days.find((d) => d.day_index === index);
    if (!day) {
      days.push({ day_index: index, name: "Rest", focus_note: null, is_rest: true, progression: "double", exercises: [] });
      continue;
    }
    const where = `Day ${index} (${day.name})`;

    if (day.rest && day.exercises.length > 0) {
      errors.push(`${where} is marked as rest but lists exercises. Rest days have none.`);
    }
    if (!day.rest && day.exercises.length === 0) {
      errors.push(`${where} is a training day with no exercises. Add exercises or mark it as rest.`);
    }

    const slugsToday = new Set<string>();
    const exercises: PlannedExercise[] = [];
    for (const item of day.exercises) {
      const entry = bySlug.get(item.slug);
      if (!entry) {
        errors.push(`${where}: "${item.slug}" is not in the catalog. Use only slugs from the catalog, copied exactly.`);
        continue;
      }
      if (slugsToday.has(item.slug)) {
        errors.push(`${where}: ${item.slug} appears twice. List each exercise once per day.`);
        continue;
      }
      slugsToday.add(item.slug);

      const prescription = checkPrescription(item, entry, where, errors);
      if (!prescription) continue;

      let progression = item.progression;
      if (progression && !POLICIES_FOR[entry.tracking].includes(progression)) {
        errors.push(
          `${where}: ${item.slug} is a ${entry.tracking} movement, so its progression must be one of ${POLICIES_FOR[entry.tracking].join(", ")} or null.`,
        );
        continue;
      }
      // An override that says what the day already says is noise in the builder.
      if (progression && progression === effectivePolicy(null, day.progression, entry.tracking)) {
        progression = null;
      }

      exercises.push({
        exercise_id: entry.id,
        slug: entry.slug,
        name: entry.name,
        tracking: entry.tracking,
        primary_muscle: entry.primary_muscle,
        sets: item.sets,
        ...prescription,
        per_side: item.per_side,
        superset_group: item.superset,
        progression,
        note: clip(item.why, LIMITS.note),
      });
    }

    days.push({
      day_index: index,
      name: clip(day.name, LIMITS.dayName) || (day.rest ? "Rest" : `Day ${index + 1}`),
      focus_note: day.focus_note ? clip(day.focus_note, LIMITS.focusNote) || null : null,
      is_rest: day.rest,
      progression: day.progression,
      exercises: tidySupersets(exercises),
    });
  }

  const training = days.filter((d) => !d.is_rest).length;
  if (training !== intake.daysPerWeek) {
    errors.push(
      `The week has ${training} training days but the person asked for ${intake.daysPerWeek}. Plan exactly ${intake.daysPerWeek}.`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      label: clip(output.label, LIMITS.label) || "AI Coach week",
      summary: clip(output.summary, LIMITS.summary),
      days,
    },
  };
}

type Prescription = Pick<PlannedExercise, "rep_min" | "rep_max" | "target_seconds">;

/** Reps for rep movements, seconds for timed and cardio ones — never a mix. */
export function checkPrescription(
  item: { slug: string; rep_min: number | null; rep_max: number | null; target_seconds: number | null },
  entry: Pick<CatalogEntry, "tracking">,
  where: string,
  errors: string[],
): Prescription | null {
  if (entry.tracking === "reps") {
    if (item.rep_min == null) {
      errors.push(`${where}: ${item.slug} is logged in reps, so rep_min is required.`);
      return null;
    }
    if (item.rep_max != null && item.rep_max < item.rep_min) {
      errors.push(`${where}: ${item.slug} has rep_max ${item.rep_max} below rep_min ${item.rep_min}.`);
      return null;
    }
    return { rep_min: item.rep_min, rep_max: item.rep_max, target_seconds: null };
  }
  if (item.target_seconds == null) {
    const what = entry.tracking === "time" ? "a hold time per set" : "a duration";
    errors.push(`${where}: ${item.slug} is logged by time, so target_seconds (${what}) is required.`);
    return null;
  }
  return { rep_min: null, rep_max: null, target_seconds: item.target_seconds };
}

/**
 * A superset needs two members next to each other. A lone member loses its
 * number; members split apart are pulled together behind the first one.
 */
export function tidySupersets<T extends { superset_group: number | null }>(exercises: T[]): T[] {
  const counts = new Map<number, number>();
  for (const e of exercises) {
    if (e.superset_group != null) counts.set(e.superset_group, (counts.get(e.superset_group) ?? 0) + 1);
  }
  const cleaned = exercises.map((e) =>
    e.superset_group != null && (counts.get(e.superset_group) ?? 0) < 2 ? { ...e, superset_group: null } : e,
  );

  const placed = new Set<T>();
  const ordered: T[] = [];
  for (const e of cleaned) {
    if (placed.has(e)) continue;
    if (e.superset_group == null) {
      ordered.push(e);
      placed.add(e);
      continue;
    }
    for (const member of cleaned) {
      if (member.superset_group === e.superset_group && !placed.has(member)) {
        ordered.push(member);
        placed.add(member);
      }
    }
  }
  return ordered;
}

/** The drafted week as a write target: always a draft, never published. */
export function planToWeek(plan: ValidPlan, current: WeekSnapshot): WeekSnapshot {
  return {
    week: {
      id: current.week?.id ?? null,
      label: plan.label,
      status: "draft",
      notes: current.week?.notes ?? null,
    },
    days: plan.days.map((day) => ({
      id: null,
      day_index: day.day_index,
      name: day.name,
      focus_note: day.focus_note,
      is_rest: day.is_rest,
      progression: day.progression,
      exercises: day.exercises.map((e, position) => ({
        id: null,
        exercise_id: e.exercise_id,
        position,
        target_sets: e.sets,
        rep_min: e.rep_min,
        rep_max: e.rep_max,
        per_side: e.per_side,
        note: e.note,
        target_weight_kg: null,
        superset_group: e.superset_group,
        target_seconds: e.target_seconds,
        progression: e.progression,
        increment_kg: null,
      })),
    })),
  };
}

/**
 * Every exercise in a stored plan still exists in the library. A custom
 * movement deleted since the draft would otherwise fail the write halfway.
 */
export function checkPlanAgainstCatalog(plan: ValidPlan, catalog: CatalogEntry[]): string[] {
  const ids = new Set(catalog.map((e) => e.id));
  return plan.days.flatMap((day) =>
    day.exercises
      .filter((e) => !ids.has(e.exercise_id))
      .map((e) => `${e.name} is no longer in your library.`),
  );
}

const POLICY_VALUES = ["double", "linear", "greyskull", "off", "time"] as const;

/** For reading a stored plan back out of a proposal. */
export const validPlanSchema: z.ZodType<ValidPlan> = z.object({
  label: z.string(),
  summary: z.string(),
  days: z.array(
    z.object({
      day_index: z.number().int().min(0).max(6),
      name: z.string(),
      focus_note: z.string().nullable(),
      is_rest: z.boolean(),
      progression: z.enum(["double", "linear", "greyskull", "off"]),
      exercises: z.array(
        z.object({
          exercise_id: z.string(),
          slug: z.string(),
          name: z.string(),
          tracking: z.enum(["reps", "time", "cardio"]),
          primary_muscle: z.string() as z.ZodType<Muscle>,
          sets: z.number().int(),
          rep_min: z.number().int().nullable(),
          rep_max: z.number().int().nullable(),
          target_seconds: z.number().int().nullable(),
          per_side: z.boolean(),
          superset_group: z.number().int().nullable(),
          progression: z.enum(POLICY_VALUES).nullable(),
          note: z.string(),
        }),
      ),
    }),
  ),
});
