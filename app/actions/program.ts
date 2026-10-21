"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { addDays, parseISO } from "date-fns";
import { currentWeekStart, toDateString } from "@/lib/dates";
import { getWeekStartsOn } from "@/lib/settings/week";
import { findPreviousWeek, getLibrary, getWeek } from "@/lib/program/queries";
import {
  EQUIPMENT_PROFILES,
  findTemplate,
  resolveTemplate,
  type EquipmentProfile,
} from "@/lib/program/templates";
import { progressWeek, summariseProgression } from "@/lib/program/progression";
import { getRecentSessions } from "@/lib/training/queries";
import type { Tracking, UnitSystem } from "@/lib/database.types";
import { displayToKg } from "@/lib/units";
import { ownExerciseSlug } from "@/lib/program/own-exercise";

export type ActionState = { error?: string; notice?: string };

const uuid = z.uuid("Expected an id.");
const weekStartSchema = z.iso.date("Expected a YYYY-MM-DD week start.");

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, user };
}

function fail(error: unknown): ActionState {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return { error: message };
}

function refresh() {
  revalidatePath("/program");
  revalidatePath("/");
}

/** The four training days a new week starts with, matching the user's split. */
const FALLBACK_TRAINING_DAYS = [0, 1, 3, 4];

/**
 * The seven days a new week starts with.
 *
 * Built from the training days chosen at onboarding rather than a fixed
 * Upper/Lower split, so someone who said they train four days gets exactly
 * those four as training days and the rest marked as rest. Names alternate
 * Upper/Lower because that is the split the starter program assumes; they are
 * renameable, and adding an exercise to a rest day turns it into a training day.
 */
function defaultDays(trainingDays: number[]) {
  const training = [...new Set(trainingDays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  const days = training.length > 0 ? training : FALLBACK_TRAINING_DAYS;
  const names = ["Upper A", "Lower A", "Upper B", "Lower B", "Full body", "Accessory", "Conditioning"];

  return Array.from({ length: 7 }, (_, day_index) => {
    const position = days.indexOf(day_index);
    return position === -1
      ? { day_index, name: "Rest", is_rest: true }
      : { day_index, name: names[position] ?? `Day ${position + 1}`, is_rest: false };
  });
}

/**
 * Ensures a draft exists for the given week. Idempotent — the unique index on
 * (user_id, week_start) means a double-click cannot create two weeks.
 */
export async function ensureWeek(weekStart: string, label = "My week") {
  const { supabase, user } = await requireUser();
  const parsedStart = weekStartSchema.parse(weekStart);

  const { data: existing } = await supabase
    .from("program_weeks")
    .select("id")
    .eq("week_start", parsedStart)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: week, error } = await supabase
    .from("program_weeks")
    .insert({ user_id: user.id, label, week_start: parsedStart })
    .select("id")
    .single();
  if (error) throw error;

  const { data: settings } = await supabase
    .from("user_settings")
    .select("training_days")
    .eq("user_id", user.id)
    .maybeSingle();

  const { error: daysError } = await supabase
    .from("program_days")
    .insert(
      defaultDays(settings?.training_days ?? FALLBACK_TRAINING_DAYS).map((d) => ({
        ...d,
        week_id: week.id,
      })),
    );
  if (daysError) throw daysError;

  return week.id;
}

export async function createCurrentWeek(): Promise<ActionState> {
  try {
    const weekStart = currentWeekStart(new Date(), await getWeekStartsOn());
    await ensureWeek(weekStart, "The Efficient 4-Day Upper / Lower");
    refresh();
    return { notice: "Draft week created." };
  } catch (error) {
    return fail(error);
  }
}

export async function publishWeek(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const weekId = uuid.parse(formData.get("weekId"));

    const { data: week } = await supabase
      .from("program_weeks")
      .select("week_start")
      .eq("id", weekId)
      .single();
    if (!week) return { error: "That week no longer exists." };

    const detail = await getWeek(week.week_start);
    const planned = detail?.days.filter((d) => !d.is_rest && d.exercises.length > 0) ?? [];
    if (planned.length === 0) {
      return { error: "Add at least one exercise before publishing." };
    }

    const { error } = await supabase
      .from("program_weeks")
      .update({ status: "published" })
      .eq("id", weekId);
    if (error) throw error;

    refresh();
    return { notice: `Week published — ${planned.length} training days.` };
  } catch (error) {
    return fail(error);
  }
}

export async function unpublishWeek(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("program_weeks")
      .update({ status: "draft" })
      .eq("id", uuid.parse(formData.get("weekId")));
    if (error) throw error;
    refresh();
    return { notice: "Back to draft." };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Duplicates the most recent earlier week into this one.
 *
 * Structure only — logged sets stay attached to the sessions that produced
 * them. With `applyProgression` on, the planned loads step up wherever last
 * week actually earned it, using the same rule the session screen shows as a
 * hint, so the advice you read is the number you get.
 */
export async function copyLastWeek(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const weekStart = weekStartSchema.parse(formData.get("weekStart"));

    const previous = await findPreviousWeek(weekStart);
    if (!previous) return { error: "There is no earlier week to copy." };

    const source = await getWeek(previous.week_start);
    if (!source) return { error: "There is no earlier week to copy." };

    const applyProgression = formData.get("applyProgression") === "on";

    // Each exercise's own rule, judged on everything logged up to the end of
    // the week being copied — the same reading the session screen gives.
    const sourceEnd = toDateString(addDays(parseISO(source.week_start), 7));
    const items = source.days.flatMap((day) =>
      day.exercises.map((item) => ({
        key: item.id,
        exerciseId: item.exercise.id,
        exerciseName: item.exercise.name,
        tracking: item.exercise.tracking ?? "reps",
        primaryMuscle: item.exercise.primary_muscle,
        equipment: item.exercise.equipment,
        dayPolicy: day.progression,
        plan: item,
      })),
    );

    let outcomes: ReturnType<typeof progressWeek> = [];
    if (applyProgression) {
      const [{ data: profile }, historyByExercise] = await Promise.all([
        supabase.from("profiles").select("unit_system").maybeSingle(),
        getRecentSessions([...new Set(items.map((i) => i.exerciseId))], { before: sourceEnd }),
      ]);
      outcomes = progressWeek({
        exercises: items,
        historyByExercise,
        system: (profile?.unit_system ?? "metric") as UnitSystem,
      });
    }
    const outcomeByItem = new Map(outcomes.map((o) => [o.key, o]));

    const weekId = await ensureWeek(weekStart, source.label);

    // Replace whatever is in the target week so the copy is not additive.
    const { data: targetDays } = await supabase
      .from("program_days")
      .select("id")
      .eq("week_id", weekId);
    if (targetDays?.length) {
      await supabase
        .from("program_exercises")
        .delete()
        .in("day_id", targetDays.map((d) => d.id));
    }
    await supabase.from("program_days").delete().eq("week_id", weekId);

    const { data: newDays, error: daysError } = await supabase
      .from("program_days")
      .insert(
        source.days.map((d) => ({
          week_id: weekId,
          day_index: d.day_index,
          name: d.name,
          focus_note: d.focus_note,
          is_rest: d.is_rest,
          progression: d.progression,
        })),
      )
      .select("id, day_index");
    if (daysError) throw daysError;

    const dayIdByIndex = new Map(newDays.map((d) => [d.day_index, d.id]));
    const rows = source.days.flatMap((day) =>
      day.exercises.map((item) => {
        const outcome = outcomeByItem.get(item.id);
        return {
          day_id: dayIdByIndex.get(day.day_index)!,
          exercise_id: item.exercise.id,
          position: item.position,
          target_sets: item.target_sets,
          rep_min: item.rep_min,
          rep_max: item.rep_max,
          per_side: item.per_side,
          note: item.note,
          superset_group: item.superset_group,
          progression: item.progression,
          increment_kg: item.increment_kg,
          target_weight_kg: outcome ? outcome.nextKg : item.target_weight_kg,
          target_seconds: outcome?.nextSeconds ?? item.target_seconds,
        };
      }),
    );
    if (rows.length) {
      const { error } = await supabase.from("program_exercises").insert(rows);
      if (error) throw error;
    }

    await supabase.from("program_weeks").update({ status: "draft" }).eq("id", weekId);
    refresh();
    return {
      notice: applyProgression
        ? `Copied ${source.label} with progression applied — ${summariseProgression(outcomes)}.`
        : `Copied ${source.label} — ${rows.length} exercises, as a draft.`,
    };
  } catch (error) {
    return fail(error);
  }
}

const addSchema = z.object({
  dayId: uuid,
  exerciseId: uuid,
  targetSets: z.coerce.number().int().min(1).max(20).default(3),
  repMin: z.coerce.number().int().min(1).max(100).nullable().catch(null),
  repMax: z.coerce.number().int().min(1).max(100).nullable().catch(null),
  perSide: z.coerce.boolean().default(false),
});

export async function addExerciseToDay(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const input = addSchema.parse({
      dayId: formData.get("dayId"),
      exerciseId: formData.get("exerciseId"),
      targetSets: formData.get("targetSets") ?? 3,
      repMin: formData.get("repMin") || null,
      repMax: formData.get("repMax") || null,
      perSide: formData.get("perSide") === "on",
    });

    const [{ data: last }, { data: exercise }] = await Promise.all([
      supabase
        .from("program_exercises")
        .select("position")
        .eq("day_id", input.dayId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("exercises").select("tracking").eq("id", input.exerciseId).maybeSingle(),
    ]);

    // A plank is not "3 × 8-12" and a treadmill is not three sets of anything:
    // timed and cardio movements start from a sensible shape of their own.
    const tracking = (exercise?.tracking ?? "reps") as Tracking;
    const shape =
      tracking === "time"
        ? { target_sets: input.targetSets, rep_min: null, rep_max: null, target_seconds: 30 }
        : tracking === "cardio"
          ? { target_sets: 1, rep_min: null, rep_max: null, target_seconds: 20 * 60 }
          : { target_sets: input.targetSets, rep_min: input.repMin, rep_max: input.repMax };

    const { error } = await supabase.from("program_exercises").insert({
      day_id: input.dayId,
      exercise_id: input.exerciseId,
      position: (last?.position ?? -1) + 1,
      per_side: input.perSide,
      ...shape,
    });
    if (error) throw error;

    // Adding to a day means it is a training day, not a rest day.
    await supabase.from("program_days").update({ is_rest: false }).eq("id", input.dayId);

    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

export async function removeProgramExercise(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("program_exercises")
      .delete()
      .eq("id", uuid.parse(formData.get("id")));
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

const updateSchema = z.object({
  id: uuid,
  targetSets: z.coerce.number().int().min(1).max(20),
  repMin: z.coerce.number().int().min(1).max(100).nullable(),
  repMax: z.coerce.number().int().min(1).max(100).nullable(),
  perSide: z.boolean(),
  note: z.string().trim().max(200).nullable(),
  // The planned load, in the units the user reads. Null means "you decide on
  // the day", which is how most accessory work is written.
  targetWeight: z.coerce.number().min(0).max(2000).nullable(),
  // Hold time for a timed movement, session length for cardio.
  targetSeconds: z.coerce.number().int().min(1).max(14400).nullable(),
  // Null follows the day's rule.
  progression: z.enum(["off", "double", "linear", "greyskull", "time"]).nullable(),
  // The step the rule adds, in display units. Null = the movement's default.
  increment: z.coerce.number().positive().max(100).nullable(),
});

export async function updateProgramExercise(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const minutes = formData.get("targetMinutes");
    const raw = {
      id: formData.get("id"),
      targetSets: formData.get("targetSets"),
      repMin: formData.get("repMin") || null,
      repMax: formData.get("repMax") || null,
      perSide: formData.get("perSide") === "on",
      note: (formData.get("note") as string)?.trim() || null,
      targetWeight: formData.get("targetWeight") || null,
      // Cardio is planned in minutes; everything is stored in seconds.
      targetSeconds: minutes
        ? Math.round(Number(minutes) * 60)
        : formData.get("targetSeconds") || null,
      progression: formData.get("progression") || null,
      increment: formData.get("increment") || null,
    };
    const input = updateSchema.parse(raw);

    if (input.repMin && input.repMax && input.repMax < input.repMin) {
      return { error: "The top of the rep range cannot be below the bottom." };
    }

    const { data: profile } = await supabase.from("profiles").select("unit_system").maybeSingle();
    const system = (profile?.unit_system ?? "metric") as UnitSystem;
    const toKg = (value: number | null) =>
      value == null ? null : Math.round(displayToKg(value, system) * 100) / 100;

    const { error } = await supabase
      .from("program_exercises")
      .update({
        target_sets: input.targetSets,
        rep_min: input.repMin,
        rep_max: input.repMax,
        per_side: input.perSide,
        note: input.note,
        target_weight_kg: toKg(input.targetWeight),
        target_seconds: input.targetSeconds,
        progression: input.progression,
        increment_kg: toKg(input.increment),
      })
      .eq("id", input.id);
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/** Persists a drag-reorder. Takes the whole day so positions stay contiguous. */
/**
 * Moves a whole training day to another slot in the week, swapping with
 * whatever is there.
 *
 * The two rows exchange `day_index`, so each day keeps its exercises and keeps
 * any session already logged against it — the session points at the day's id,
 * not at a weekday. Swapping the days' contents instead would quietly relabel
 * last week's workout.
 *
 * It goes through a database function because a full week fills every index
 * from 0 to 6 and the unique constraint leaves nowhere to park the first row
 * mid-swap; the function defers that constraint so both updates are judged
 * together.
 */
export async function swapDays(dayA: string, dayB: string): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("swap_program_days", {
      day_a: uuid.parse(dayA),
      day_b: uuid.parse(dayB),
    });
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/**
 * Joins an exercise to the one after it in a superset — or, if either is
 * already in one, grows that superset. Supersets are a shared number on the
 * rows of one day; the session runs rows with the same number back to back.
 */
export async function linkWithNext(rowId: string): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const id = uuid.parse(rowId);
    const { data: row } = await supabase
      .from("program_exercises")
      .select("day_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) return { error: "That exercise is no longer in the plan." };

    const { data: rows } = await supabase
      .from("program_exercises")
      .select("id, position, superset_group")
      .eq("day_id", row.day_id)
      .order("position");
    const ordered = rows ?? [];
    const at = ordered.findIndex((r) => r.id === id);
    const self = ordered[at];
    const next = ordered[at + 1];
    if (!self || !next) return { error: "There is nothing after this one to pair it with." };

    const used = new Set(ordered.map((r) => r.superset_group).filter((g): g is number => g != null));
    const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((g) => !used.has(g));
    const group = self.superset_group ?? next.superset_group ?? free;
    if (group == null) return { error: "A day can hold nine supersets at most." };

    // If the next row was in a different superset, the two merge into one.
    const merging = next.superset_group != null && next.superset_group !== group ? next.superset_group : null;
    const ids = ordered
      .filter((r) => r.id === self.id || r.id === next.id || (merging != null && r.superset_group === merging))
      .map((r) => r.id);
    const { error } = await supabase
      .from("program_exercises")
      .update({ superset_group: group })
      .in("id", ids);
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/** Takes an exercise out of its superset; a superset left with one member dissolves. */
export async function unlinkSuperset(rowId: string): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const id = uuid.parse(rowId);
    const { data: row } = await supabase
      .from("program_exercises")
      .select("day_id, superset_group")
      .eq("id", id)
      .maybeSingle();
    if (!row || row.superset_group == null) return {};

    const { error } = await supabase
      .from("program_exercises")
      .update({ superset_group: null })
      .eq("id", id);
    if (error) throw error;

    const { data: rest } = await supabase
      .from("program_exercises")
      .select("id")
      .eq("day_id", row.day_id)
      .eq("superset_group", row.superset_group);
    if ((rest ?? []).length === 1) {
      await supabase.from("program_exercises").update({ superset_group: null }).eq("id", rest![0]!.id);
    }
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

export async function reorderDayExercises(dayId: string, orderedIds: string[]) {
  const { supabase } = await requireUser();
  uuid.parse(dayId);
  z.array(uuid).min(1).parse(orderedIds);

  // Two-phase: shift into a range that cannot collide, then write final values.
  // A single pass would violate nothing today, but keeps positions unique if a
  // uniqueness constraint is added later.
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from("program_exercises")
        .update({ position: i + 1000 })
        .eq("id", id)
        .eq("day_id", dayId),
    ),
  );
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from("program_exercises")
        .update({ position: i })
        .eq("id", id)
        .eq("day_id", dayId),
    ),
  );

  refresh();
}

const daySchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, "A day needs a name.").max(40),
  focusNote: z.string().trim().max(300).nullable(),
  isRest: z.boolean(),
  progression: z.enum(["off", "double", "linear", "greyskull"]),
});

export async function updateDay(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const input = daySchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      focusNote: (formData.get("focusNote") as string)?.trim() || null,
      isRest: formData.get("isRest") === "on",
      progression: formData.get("progression") ?? "double",
    });
    const { error } = await supabase
      .from("program_days")
      .update({
        name: input.name,
        focus_note: input.focusNote,
        is_rest: input.isRest,
        progression: input.progression,
      })
      .eq("id", input.id);
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/**
 * Renames a week and, if asked, moves it to a different start date.
 *
 * Moving a week is just a new `week_start`: days hang off the week by position
 * and sessions hang off the days, so nothing logged is disturbed — the same
 * seven days simply sit on different dates. A week may begin on any weekday,
 * which is how a Saturday→Friday split is expressed without waiting for the
 * per-user default to be set.
 */
export async function updateWeek(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const weekId = uuid.parse(formData.get("weekId"));
    const label = z.string().trim().min(1, "A week needs a name.").max(80).parse(formData.get("label"));
    const weekStart = weekStartSchema.parse(formData.get("weekStart"));

    const { error } = await supabase
      .from("program_weeks")
      .update({ label, week_start: weekStart })
      .eq("id", weekId);

    // unique (user_id, week_start): two weeks cannot share a start date.
    if (error?.code === "23505") {
      return { error: "You already have a week starting that day. Pick another date." };
    }
    if (error) throw error;

    refresh();
    return { notice: "Week updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function renameWeek(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const label = z.string().trim().min(1).max(80).parse(formData.get("label"));
    const { error } = await supabase
      .from("program_weeks")
      .update({ label })
      .eq("id", uuid.parse(formData.get("weekId")));
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/** One resolved line from the paste review step. */
const pastedDaySchema = z.object({
  dayIndex: z.number().int().min(0).max(6),
  name: z.string().trim().min(1).max(40),
  focusNote: z.string().trim().max(300).nullable(),
  isRest: z.boolean(),
  exercises: z
    .array(
      z
        .object({
          exerciseId: uuid.nullable(),
          // A line kept as the user's own exercise rather than a library match.
          newExercise: z
            .object({
              name: z.string().trim().min(2).max(80),
              primaryMuscle: z.enum([
                "chest", "lats", "middle_back", "lower_back", "traps", "shoulders", "biceps",
                "triceps", "forearms", "quadriceps", "hamstrings", "glutes", "calves",
                "abdominals", "abductors", "adductors", "neck",
              ]),
              equipment: z.enum([
                "barbell", "dumbbell", "machine", "cable", "body_only", "bands", "kettlebells",
                "ez_curl_bar", "exercise_ball", "medicine_ball", "foam_roll", "other",
              ]),
              tracking: z.enum(["reps", "time", "cardio"]),
            })
            .nullable()
            .default(null),
          targetSets: z.number().int().min(1).max(20),
          repMin: z.number().int().min(1).max(100).nullable(),
          repMax: z.number().int().min(1).max(100).nullable(),
          // Hold time per set, or a cardio block's length.
          targetSeconds: z.number().int().min(1).max(14400).nullable().default(null),
          perSide: z.boolean(),
          note: z.string().trim().max(200).nullable(),
        })
        .refine((e) => e.exerciseId != null || e.newExercise != null, "Each line needs an exercise."),
    )
    .max(30),
});

/**
 * Writes a reviewed paste over the week, replacing its days wholesale.
 * Unmatched lines are dropped by the review UI before they get here.
 */
export async function applyPastedWeek(
  weekStart: string,
  label: string,
  days: unknown,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const parsedStart = weekStartSchema.parse(weekStart);
    const parsedDays = z.array(pastedDaySchema).min(1).max(7).parse(days);

    // Lines kept as the user's own exercises: reuse one of theirs with the same
    // name, otherwise create it — once, however many days it appears on.
    const wanted = new Map<string, NonNullable<(typeof parsedDays)[number]["exercises"][number]["newExercise"]>>();
    for (const day of parsedDays) {
      for (const item of day.exercises) {
        if (!item.exerciseId && item.newExercise) wanted.set(item.newExercise.name.toLowerCase(), item.newExercise);
      }
    }
    const ownIdByName = new Map<string, string>();
    if (wanted.size) {
      const { data: mine } = await supabase
        .from("exercises")
        .select("id, name")
        .eq("owner_id", user.id)
        .is("archived_at", null);
      for (const e of mine ?? []) ownIdByName.set(e.name.toLowerCase(), e.id);
      for (const [key, spec] of wanted) {
        if (ownIdByName.has(key)) continue;
        for (let attempt = 0; attempt < 5 && !ownIdByName.has(key); attempt++) {
          const { data, error } = await supabase
            .from("exercises")
            .insert({
              owner_id: user.id,
              slug: ownExerciseSlug(user.id, spec.name, attempt),
              name: spec.name,
              primary_muscle: spec.primaryMuscle,
              equipment: spec.equipment,
              tracking: spec.tracking,
            })
            .select("id")
            .single();
          if (error?.code === "23505") continue;
          if (error) throw error;
          ownIdByName.set(key, data.id);
        }
        if (!ownIdByName.has(key)) throw new Error(`Could not add “${spec.name}” to your library.`);
      }
    }
    const exerciseIdFor = (item: (typeof parsedDays)[number]["exercises"][number]) =>
      item.exerciseId ?? ownIdByName.get(item.newExercise!.name.toLowerCase())!;

    const weekId = await ensureWeek(parsedStart, label);

    const { data: oldDays } = await supabase
      .from("program_days")
      .select("id")
      .eq("week_id", weekId);
    if (oldDays?.length) {
      await supabase
        .from("program_exercises")
        .delete()
        .in("day_id", oldDays.map((d) => d.id));
    }
    await supabase.from("program_days").delete().eq("week_id", weekId);

    // Days the paste did not mention (Wednesday in a Mon/Tue/Thu/Fri week)
    // become rest days, so the week stays whole and they can still be filled.
    const pastedIndexes = new Set(parsedDays.map((d) => d.dayIndex));
    const { data: newDays, error: daysError } = await supabase
      .from("program_days")
      .insert([
        ...parsedDays.map((d) => ({
          week_id: weekId,
          day_index: d.dayIndex,
          name: d.name,
          focus_note: d.focusNote,
          is_rest: d.isRest,
        })),
        ...[0, 1, 2, 3, 4, 5, 6]
          .filter((i) => !pastedIndexes.has(i))
          .map((i) => ({ week_id: weekId, day_index: i, name: "Rest", focus_note: null, is_rest: true })),
      ])
      .select("id, day_index");
    if (daysError) throw daysError;

    const dayIdByIndex = new Map(newDays.map((d) => [d.day_index, d.id]));
    const rows = parsedDays.flatMap((day) =>
      day.exercises.map((item, position) => ({
        day_id: dayIdByIndex.get(day.dayIndex)!,
        exercise_id: exerciseIdFor(item),
        position,
        target_sets: item.targetSets,
        rep_min: item.repMin,
        rep_max: item.repMax,
        target_seconds: item.targetSeconds,
        per_side: item.perSide,
        note: item.note,
      })),
    );
    if (rows.length) {
      const { error } = await supabase.from("program_exercises").insert(rows);
      if (error) throw error;
    }

    await supabase
      .from("program_weeks")
      .update({ label, status: "draft" })
      .eq("id", weekId);

    refresh();
    const created = wanted.size ? ` ${wanted.size} added to your library as your own.` : "";
    return {
      notice: `Imported ${rows.length} exercises across ${parsedDays.filter((d) => d.exercises.length).length} days.${created}`,
    };
  } catch (error) {
    return fail(error);
  }
}


/**
 * Fills a week from one of the fixed templates.
 *
 * Not generation — the blueprints are hand-written and the same choice always
 * produces the same week. It exists because a blank builder is useless to
 * somebody who does not yet know what to write; they still edit and publish it,
 * so the program remains theirs.
 */
export async function applyTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const weekStart = weekStartSchema.parse(formData.get("weekStart"));
    const templateSlug = z.string().trim().min(1).parse(formData.get("template"));
    const equipment = z
      .enum(EQUIPMENT_PROFILES.map((p) => p.key) as [EquipmentProfile, ...EquipmentProfile[]])
      .parse(formData.get("equipment") ?? "full_gym");

    const template = findTemplate(templateSlug);
    if (!template) return { error: "That template no longer exists." };

    const library = await getLibrary();
    const resolved = resolveTemplate(template, library, equipment);

    const planned = resolved.days.filter((d) => d.exercises.length > 0);
    if (planned.length === 0) {
      return {
        error:
          "Nothing in the library fits that equipment. Try a fuller equipment option.",
      };
    }

    const weekId = await ensureWeek(weekStart, template.name);

    // Replace the week outright — a template merged into existing days would be
    // neither the template nor what was there before.
    const { data: oldDays } = await supabase
      .from("program_days")
      .select("id")
      .eq("week_id", weekId);
    if (oldDays?.length) {
      await supabase
        .from("program_exercises")
        .delete()
        .in("day_id", oldDays.map((d) => d.id));
    }
    await supabase.from("program_days").delete().eq("week_id", weekId);

    // Rest days for everything the template does not use, so the week is whole.
    const trainingIndexes = new Set(resolved.days.map((d) => d.dayIndex));
    const dayRows = [
      ...resolved.days.map((d) => ({
        week_id: weekId,
        day_index: d.dayIndex,
        name: d.name,
        focus_note: d.focusNote,
        is_rest: false,
        // A strength template is its rule as much as its exercises.
        progression: template.progression ?? "double",
      })),
      ...[0, 1, 2, 3, 4, 5, 6]
        .filter((i) => !trainingIndexes.has(i))
        .map((i) => ({
          week_id: weekId,
          day_index: i,
          name: "Rest",
          focus_note: null,
          is_rest: true,
        })),
    ];

    const { data: newDays, error: daysError } = await supabase
      .from("program_days")
      .insert(dayRows)
      .select("id, day_index");
    if (daysError) throw daysError;

    const dayIdByIndex = new Map(newDays.map((d) => [d.day_index, d.id]));
    const exerciseRows = resolved.days.flatMap((day) =>
      day.exercises.map((exercise, position) => ({
        day_id: dayIdByIndex.get(day.dayIndex)!,
        exercise_id: exercise.exerciseId,
        position,
        target_sets: exercise.targetSets,
        rep_min: exercise.repMin,
        rep_max: exercise.repMax,
        per_side: exercise.perSide,
      })),
    );
    if (exerciseRows.length) {
      const { error } = await supabase.from("program_exercises").insert(exerciseRows);
      if (error) throw error;
    }

    await supabase
      .from("program_weeks")
      .update({ label: template.name, status: "draft" })
      .eq("id", weekId);

    refresh();
    return {
      notice:
        resolved.unfilled.length > 0
          ? `Filled ${exerciseRows.length} exercises. Your equipment could not cover: ${resolved.unfilled.join(", ")}.`
          : `Filled ${exerciseRows.length} exercises across ${planned.length} days. Edit anything before you publish.`,
    };
  } catch (error) {
    return fail(error);
  }
}
