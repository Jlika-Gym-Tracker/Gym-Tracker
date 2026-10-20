"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRecentSessions } from "@/lib/training/queries";
import { prescribe } from "@/lib/program/prescription";
import type { UnitSystem } from "@/lib/database.types";


export type ActionState = { error?: string; notice?: string };

const uuid = z.uuid();

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, user };
}

function fail(error: unknown): ActionState {
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

function refresh(sessionId?: string) {
  if (sessionId) revalidatePath(`/session/${sessionId}`);
  revalidatePath("/session");
  revalidatePath("/");
}

/**
 * Starts (or resumes) a session for a program day.
 *
 * A partial unique index allows only one open session per person, so a second
 * "Start" resumes the first rather than creating a duplicate.
 */
export async function startSession(formData: FormData) {
  const { supabase, user } = await requireUser();
  const dayId = formData.get("dayId");
  const parsedDayId = typeof dayId === "string" && dayId ? uuid.parse(dayId) : null;

  const { data: open } = await supabase
    .from("workout_sessions")
    .select("id")
    .is("ended_at", null)
    .maybeSingle();
  if (open) redirect(`/session/${open.id}`);

  let title: string | null = null;
  if (parsedDayId) {
    const { data: day } = await supabase
      .from("program_days")
      .select("name")
      .eq("id", parsedDayId)
      .maybeSingle();
    title = day?.name ?? null;
  }

  const { data: session, error } = await supabase
    .from("workout_sessions")
    .insert({ user_id: user.id, day_id: parsedDayId, title })
    .select("id")
    .single();
  if (error) throw error;

  // Seed empty rows for the planned sets so the grid is ready to type into.
  if (parsedDayId) {
    const [{ data: planned }, { data: day }, { data: profile }] = await Promise.all([
      supabase
        .from("program_exercises")
        .select(
          `exercise_id, target_sets, rep_min, rep_max, target_seconds, target_weight_kg,
           progression, increment_kg,
           exercise:exercises ( primary_muscle, equipment, tracking )`,
        )
        .eq("day_id", parsedDayId)
        .order("position"),
      supabase.from("program_days").select("progression").eq("id", parsedDayId).maybeSingle(),
      supabase.from("profiles").select("unit_system").maybeSingle(),
    ]);

    type Planned = NonNullable<typeof planned>[number] & {
      exercise: { primary_muscle: string; equipment: string; tracking: "reps" | "time" | "cardio" };
    };
    const items = (planned ?? []) as unknown as Planned[];
    const system = (profile?.unit_system ?? "metric") as UnitSystem;
    const history = await getRecentSessions(items.map((p) => p.exercise_id), {
      excludeSessionId: session.id,
    });

    const rows = items.flatMap((p) => {
      const past = history.get(p.exercise_id) ?? [];
      const next = prescribe(
        {
          tracking: p.exercise.tracking,
          primaryMuscle: p.exercise.primary_muscle,
          equipment: p.exercise.equipment,
          dayPolicy: day?.progression ?? null,
          plan: p,
        },
        past,
        system,
      );
      const lastSets = past[0]?.sets ?? [];
      return Array.from({ length: p.target_sets }, (_, i) => ({
        session_id: session.id,
        exercise_id: p.exercise_id,
        set_index: i,
        // Pre-fill the load so the common case is tick, not type: the rule's
        // number when it has one, else the plan's, else what this set weighed
        // last time. An editable starting value, not a record of anything.
        weight_kg:
          p.exercise.tracking === "cardio"
            ? null
            : (next.weightKg ?? p.target_weight_kg ?? lastSets[i]?.weight_kg ?? lastSets.at(-1)?.weight_kg ?? null),
      }));
    });
    if (rows.length) await supabase.from("set_logs").insert(rows);
  }

  refresh(session.id);
  redirect(`/session/${session.id}`);
}

const setSchema = z.object({
  id: uuid,
  weightKg: z.number().min(0).max(1000).nullable(),
  reps: z.number().int().min(0).max(500).nullable(),
  // Undefined leaves the stored rating alone (the effort column is hidden).
  rpe: z.number().min(1).max(10).nullable().optional(),
  durationS: z.number().int().min(0).max(86400).nullable().default(null),
  distanceM: z.number().min(0).max(1_000_000).nullable().default(null),
  isComplete: z.boolean(),
});

/**
 * Writes one set row. Called on blur and on ticking the checkbox; the client
 * holds the optimistic state, so this only has to be correct, not instant.
 */
export async function saveSet(input: {
  id: string;
  weightKg: number | null;
  reps: number | null;
  rpe?: number | null;
  durationS?: number | null;
  distanceM?: number | null;
  isComplete: boolean;
}): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const parsed = setSchema.parse(input);

    // Completing a set with nothing in it is almost always a misclick. Reps,
    // a held time or a distance — whichever the movement is logged in.
    if (
      parsed.isComplete &&
      parsed.reps == null &&
      parsed.durationS == null &&
      parsed.distanceM == null
    ) {
      return { error: "Add reps (or a time) before ticking the set off." };
    }

    const { error } = await supabase
      .from("set_logs")
      .update({
        weight_kg: parsed.weightKg,
        reps: parsed.reps,
        ...(parsed.rpe === undefined ? {} : { rpe: parsed.rpe }),
        duration_s: parsed.durationS,
        distance_m: parsed.distanceM,
        is_complete: parsed.isComplete,
        logged_at: new Date().toISOString(),
      })
      .eq("id", parsed.id);
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

export async function addSet(sessionId: string, exerciseId: string): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    uuid.parse(sessionId);
    uuid.parse(exerciseId);

    const { data: last } = await supabase
      .from("set_logs")
      .select("set_index, weight_kg, reps")
      .eq("session_id", sessionId)
      .eq("exercise_id", exerciseId)
      .order("set_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("set_logs").insert({
      session_id: sessionId,
      exercise_id: exerciseId,
      set_index: (last?.set_index ?? -1) + 1,
      // Carry the previous load forward — the common case is another set at the same weight.
      weight_kg: last?.weight_kg ?? null,
    });
    if (error) throw error;
    refresh(sessionId);
    return {};
  } catch (error) {
    return fail(error);
  }
}

export async function removeSet(setId: string): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("set_logs").delete().eq("id", uuid.parse(setId));
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/** Adds an unplanned movement to a session already in progress. */
export async function addExerciseToSession(
  sessionId: string,
  exerciseId: string,
  sets = 3,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    uuid.parse(sessionId);
    uuid.parse(exerciseId);

    const { data: existing } = await supabase
      .from("set_logs")
      .select("id")
      .eq("session_id", sessionId)
      .eq("exercise_id", exerciseId)
      .limit(1);
    if (existing?.length) return { error: "That movement is already in this session." };

    const { error } = await supabase.from("set_logs").insert(
      Array.from({ length: Math.min(Math.max(sets, 1), 10) }, (_, i) => ({
        session_id: sessionId,
        exercise_id: exerciseId,
        set_index: i,
      })),
    );
    if (error) throw error;
    refresh(sessionId);
    return {};
  } catch (error) {
    return fail(error);
  }
}

export async function finishSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const sessionId = uuid.parse(formData.get("sessionId"));

    // Empty rows are scaffolding, not history — drop them on the way out.
    await supabase
      .from("set_logs")
      .delete()
      .eq("session_id", sessionId)
      .eq("is_complete", false)
      .is("reps", null)
      .is("duration_s", null)
      .is("distance_m", null);

    const { error } = await supabase
      .from("workout_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) throw error;

    revalidatePath("/", "layout");
  } catch (error) {
    return fail(error);
  }
  redirect(`/session/${uuid.parse(formData.get("sessionId"))}/summary`);
}

export async function discardSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const sessionId = uuid.parse(formData.get("sessionId"));

    const { data: logged } = await supabase
      .from("set_logs")
      .select("id")
      .eq("session_id", sessionId)
      .eq("is_complete", true)
      .limit(1);
    if (logged?.length) {
      return { error: "This session has completed sets. Finish it instead of discarding." };
    }

    const { error } = await supabase.from("workout_sessions").delete().eq("id", sessionId);
    if (error) throw error;
    revalidatePath("/", "layout");
  } catch (error) {
    return fail(error);
  }
  redirect("/");
}

const ratingSchema = z.object({
  sessionId: uuid,
  // 1 = too easy, 2 = about right, 3 = brutal. Null clears it.
  rating: z.number().int().min(1).max(3).nullable(),
  note: z.string().trim().max(500).nullable(),
});

/**
 * How the session felt, from the finish summary. Optional and one tap; the
 * note is free text. Both are read back by the AI Coach's reviews when that is
 * switched on, and by nothing else.
 */
export async function rateSession(input: {
  sessionId: string;
  rating: number | null;
  note: string | null;
}): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const parsed = ratingSchema.parse(input);
    const { error } = await supabase
      .from("workout_sessions")
      .update({ rating: parsed.rating, notes: parsed.note || null })
      .eq("id", parsed.sessionId)
      .not("ended_at", "is", null);
    if (error) throw error;
    revalidatePath(`/session/${parsed.sessionId}/summary`);
    return { notice: "Saved." };
  } catch (error) {
    return fail(error);
  }
}

/** Records the bodyweight typed on the session screen. */
export async function setSessionBodyweight(
  sessionId: string,
  bodyweightKg: number | null,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const value = bodyweightKg == null ? null : z.number().min(20).max(400).parse(bodyweightKg);
    const { error } = await supabase
      .from("workout_sessions")
      .update({ bodyweight_kg: value })
      .eq("id", uuid.parse(sessionId));
    if (error) throw error;
    return {};
  } catch (error) {
    return fail(error);
  }
}
