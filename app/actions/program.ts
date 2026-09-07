"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/dates";
import { findPreviousWeek, getLibrary, getWeek } from "@/lib/program/queries";
import {
  EQUIPMENT_PROFILES,
  findTemplate,
  resolveTemplate,
  type EquipmentProfile,
} from "@/lib/program/templates";

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
const DEFAULT_DAYS = [
  { day_index: 0, name: "Upper A", is_rest: false },
  { day_index: 1, name: "Lower A", is_rest: false },
  { day_index: 2, name: "Rest", is_rest: true },
  { day_index: 3, name: "Upper B", is_rest: false },
  { day_index: 4, name: "Lower B", is_rest: false },
  { day_index: 5, name: "Rest", is_rest: true },
  { day_index: 6, name: "Rest", is_rest: true },
];

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

  const { error: daysError } = await supabase
    .from("program_days")
    .insert(DEFAULT_DAYS.map((d) => ({ ...d, week_id: week.id })));
  if (daysError) throw daysError;

  return week.id;
}

export async function createCurrentWeek(): Promise<ActionState> {
  try {
    await ensureWeek(currentWeekStart(), "The Efficient 4-Day Upper / Lower");
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
 * Duplicates the most recent earlier week into this one. Copies structure only —
 * never logged sets, which stay attached to the sessions that produced them.
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
        })),
      )
      .select("id, day_index");
    if (daysError) throw daysError;

    const dayIdByIndex = new Map(newDays.map((d) => [d.day_index, d.id]));
    const rows = source.days.flatMap((day) =>
      day.exercises.map((item) => ({
        day_id: dayIdByIndex.get(day.day_index)!,
        exercise_id: item.exercise.id,
        position: item.position,
        target_sets: item.target_sets,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
        per_side: item.per_side,
        note: item.note,
      })),
    );
    if (rows.length) {
      const { error } = await supabase.from("program_exercises").insert(rows);
      if (error) throw error;
    }

    await supabase.from("program_weeks").update({ status: "draft" }).eq("id", weekId);
    refresh();
    return { notice: `Copied ${source.label} — ${rows.length} exercises, as a draft.` };
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

    const { data: last } = await supabase
      .from("program_exercises")
      .select("position")
      .eq("day_id", input.dayId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("program_exercises").insert({
      day_id: input.dayId,
      exercise_id: input.exerciseId,
      position: (last?.position ?? -1) + 1,
      target_sets: input.targetSets,
      rep_min: input.repMin,
      rep_max: input.repMax,
      per_side: input.perSide,
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
});

export async function updateProgramExercise(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const raw = {
      id: formData.get("id"),
      targetSets: formData.get("targetSets"),
      repMin: formData.get("repMin") || null,
      repMax: formData.get("repMax") || null,
      perSide: formData.get("perSide") === "on",
      note: (formData.get("note") as string)?.trim() || null,
    };
    const input = updateSchema.parse(raw);

    if (input.repMin && input.repMax && input.repMax < input.repMin) {
      return { error: "The top of the rep range cannot be below the bottom." };
    }

    const { error } = await supabase
      .from("program_exercises")
      .update({
        target_sets: input.targetSets,
        rep_min: input.repMin,
        rep_max: input.repMax,
        per_side: input.perSide,
        note: input.note,
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
    });
    const { error } = await supabase
      .from("program_days")
      .update({ name: input.name, focus_note: input.focusNote, is_rest: input.isRest })
      .eq("id", input.id);
    if (error) throw error;
    refresh();
    return {};
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
      z.object({
        exerciseId: uuid,
        targetSets: z.number().int().min(1).max(20),
        repMin: z.number().int().min(1).max(100).nullable(),
        repMax: z.number().int().min(1).max(100).nullable(),
        perSide: z.boolean(),
        note: z.string().trim().max(200).nullable(),
      }),
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
    const { supabase } = await requireUser();
    const parsedStart = weekStartSchema.parse(weekStart);
    const parsedDays = z.array(pastedDaySchema).min(1).max(7).parse(days);

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

    const { data: newDays, error: daysError } = await supabase
      .from("program_days")
      .insert(
        parsedDays.map((d) => ({
          week_id: weekId,
          day_index: d.dayIndex,
          name: d.name,
          focus_note: d.focusNote,
          is_rest: d.isRest,
        })),
      )
      .select("id, day_index");
    if (daysError) throw daysError;

    const dayIdByIndex = new Map(newDays.map((d) => [d.day_index, d.id]));
    const rows = parsedDays.flatMap((day) =>
      day.exercises.map((item, position) => ({
        day_id: dayIdByIndex.get(day.dayIndex)!,
        exercise_id: item.exerciseId,
        position,
        target_sets: item.targetSets,
        rep_min: item.repMin,
        rep_max: item.repMax,
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
    return { notice: `Imported ${rows.length} exercises across ${parsedDays.length} days.` };
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
