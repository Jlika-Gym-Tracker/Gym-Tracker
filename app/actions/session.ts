"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";


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
    const { data: planned } = await supabase
      .from("program_exercises")
      .select("exercise_id, target_sets, target_weight_kg")
      .eq("day_id", parsedDayId)
      .order("position");

    const rows = (planned ?? []).flatMap((p) =>
      Array.from({ length: p.target_sets }, (_, i) => ({
        session_id: session.id,
        exercise_id: p.exercise_id,
        set_index: i,
        // Pre-fill the planned load so the common case is tick, not type. It is
        // an editable starting value, not a record of anything.
        weight_kg: p.target_weight_kg,
      })),
    );
    if (rows.length) await supabase.from("set_logs").insert(rows);
  }

  refresh(session.id);
  redirect(`/session/${session.id}`);
}

const setSchema = z.object({
  id: uuid,
  weightKg: z.number().min(0).max(1000).nullable(),
  reps: z.number().int().min(0).max(500).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
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
  rpe: number | null;
  isComplete: boolean;
}): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const parsed = setSchema.parse(input);

    // Completing a set with nothing in it is almost always a misclick.
    if (parsed.isComplete && parsed.reps == null) {
      return { error: "Add reps before ticking the set off." };
    }

    const { error } = await supabase
      .from("set_logs")
      .update({
        weight_kg: parsed.weightKg,
        reps: parsed.reps,
        rpe: parsed.rpe,
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
      .is("reps", null);

    const { error } = await supabase
      .from("workout_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) throw error;

    revalidatePath("/", "layout");
  } catch (error) {
    return fail(error);
  }
  redirect("/?finished=1");
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
