"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
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

function refresh() {
  revalidatePath("/coach", "layout");
  revalidatePath("/profile");
  revalidatePath("/program");
  revalidatePath("/", "layout");
}

/** Coaching is a capability on a normal account, not a separate kind of user. */
export async function setCoaching(enabled: boolean): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("profiles")
      .update({ coaching_enabled: z.boolean().parse(enabled) })
      .eq("id", user.id);
    if (error) throw error;
    refresh();
    return { notice: enabled ? "Coaching turned on." : "Coaching turned off." };
  } catch (error) {
    return fail(error);
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `COACH-${[...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")}`;
}

export async function createCoachInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { code?: string }> {
  try {
    const { supabase, user } = await requireUser();
    const label = z
      .union([z.literal(""), z.string().trim().max(60)])
      .transform((v) => v || null)
      .parse(formData.get("label") ?? "");

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { error } = await supabase.from("coach_invites").insert({
        code,
        coach_id: user.id,
        label,
        uses_left: 10,
        expires_at: addDays(new Date(), 30).toISOString(),
      });
      if (!error) {
        refresh();
        return { code, notice: `${code} — 10 uses, 30 days.` };
      }
      if (error.code !== "23505") throw error;
    }
    return { error: "Could not generate a unique code. Try again." };
  } catch (error) {
    return fail(error);
  }
}

/**
 * An athlete joins a coach.
 *
 * The link starts with training shared and nothing else — the athlete opts into
 * body, photos and nutrition afterwards, from their own profile.
 */
export async function joinCoach(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const code = z.string().trim().min(4).max(24).parse(formData.get("code")).toUpperCase();

    const { data, error } = await supabase.rpc("redeem_coach_invite", {
      invite_code: code,
    });
    if (error) return { error: error.message };

    const coach = data?.[0];
    refresh();
    return {
      notice: coach
        ? `You're now coached by ${coach.coach_name}. They can see your training — nothing else until you say so.`
        : "Joined.",
    };
  } catch (error) {
    return fail(error);
  }
}

const shareSchema = z.object({
  coachId: uuid,
  scope: z.enum(["share_training", "share_body_metrics", "share_photos", "share_nutrition"]),
  value: z.boolean(),
});

/** Only the athlete can change this; RLS enforces it as well as the action. */
export async function setCoachSharing(
  coachId: string,
  scope: string,
  value: boolean,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = shareSchema.parse({ coachId, scope, value });
    const patch: Partial<Record<typeof input.scope, boolean>> = {
      [input.scope]: input.value,
    };

    const { error } = await supabase
      .from("coach_links")
      .update(patch)
      .eq("coach_id", input.coachId)
      .eq("athlete_id", user.id);
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

export async function endCoachLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    // RLS allows either side to delete; nothing is retained afterwards.
    const { error } = await supabase
      .from("coach_links")
      .delete()
      .eq("coach_id", uuid.parse(formData.get("coachId")))
      .eq("athlete_id", uuid.parse(formData.get("athleteId")));
    if (error) throw error;
    refresh();
    return { notice: "Coaching link ended. Access was revoked immediately." };
  } catch (error) {
    return fail(error);
  }
}

// ------------------------------------------------------------ coach programs

export async function createCoachProgram(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const name = z.string().trim().min(2).max(80).parse(formData.get("name"));

    const { data: program, error } = await supabase
      .from("coach_programs")
      .insert({ coach_id: user.id, name })
      .select("id")
      .single();
    if (error) throw error;

    // A blank program is useless; seed the days so there is something to edit.
    await supabase.from("coach_program_days").insert(
      [
        { day_index: 0, name: "Day 1", is_rest: false },
        { day_index: 1, name: "Day 2", is_rest: false },
        { day_index: 3, name: "Day 3", is_rest: false },
        { day_index: 4, name: "Day 4", is_rest: false },
      ].map((d) => ({ ...d, program_id: program.id })),
    );

    refresh();
    return { notice: `Created ${name}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCoachProgram(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("coach_programs")
      .delete()
      .eq("id", uuid.parse(formData.get("programId")));
    if (error) throw error;
    refresh();
    return { notice: "Program deleted. Weeks already assigned are unaffected." };
  } catch (error) {
    return fail(error);
  }
}

export async function addCoachProgramExercise(
  dayId: string,
  exerciseId: string,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    uuid.parse(dayId);
    uuid.parse(exerciseId);

    const { data: last } = await supabase
      .from("coach_program_exercises")
      .select("position")
      .eq("day_id", dayId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("coach_program_exercises").insert({
      day_id: dayId,
      exercise_id: exerciseId,
      position: (last?.position ?? -1) + 1,
      target_sets: 3,
      rep_min: 8,
      rep_max: 12,
    });
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

export async function removeCoachProgramExercise(id: string): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("coach_program_exercises")
      .delete()
      .eq("id", uuid.parse(id));
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/**
 * Copies a coach's program into an athlete's week.
 *
 * It lands as a published week stamped with the coach's id, so the athlete's
 * program screen can say where it came from. They can still edit it — it is
 * their week, and the app's first rule has not changed.
 */
export async function assignProgram(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const programId = uuid.parse(formData.get("programId"));
    const athleteId = uuid.parse(formData.get("athleteId"));
    const weekStart = z.iso.date().parse(formData.get("weekStart"));

    const { data: link } = await supabase
      .from("coach_links")
      .select("status, share_training")
      .eq("coach_id", user.id)
      .eq("athlete_id", athleteId)
      .maybeSingle();
    if (!link || link.status !== "active" || !link.share_training) {
      return { error: "You are not currently coaching that athlete." };
    }

    const { data: program } = await supabase
      .from("coach_programs")
      .select(
        `name,
         days:coach_program_days (
           day_index, name, focus_note, is_rest,
           exercises:coach_program_exercises (
             exercise_id, position, target_sets, rep_min, rep_max, per_side, note, target_weight_kg
           )
         )`,
      )
      .eq("id", programId)
      .maybeSingle();
    if (!program) return { error: "That program no longer exists." };

    type Day = {
      day_index: number; name: string; focus_note: string | null; is_rest: boolean;
      exercises: {
        exercise_id: string; position: number; target_sets: number;
        rep_min: number | null; rep_max: number | null; per_side: boolean;
        note: string | null; target_weight_kg: number | null;
      }[];
    };
    const days = (program.days ?? []) as unknown as Day[];
    if (days.every((d) => d.exercises.length === 0)) {
      return { error: "That program has no exercises yet." };
    }

    const { data: existing } = await supabase
      .from("program_weeks")
      .select("id")
      .eq("user_id", athleteId)
      .eq("week_start", weekStart)
      .maybeSingle();

    let weekId = existing?.id;
    if (weekId) {
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
      await supabase
        .from("program_weeks")
        .update({ label: program.name, status: "published", assigned_by_coach_id: user.id })
        .eq("id", weekId);
    } else {
      const { data: created, error } = await supabase
        .from("program_weeks")
        .insert({
          user_id: athleteId,
          label: program.name,
          week_start: weekStart,
          status: "published",
          assigned_by_coach_id: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      weekId = created.id;
    }

    const trainingIndexes = new Set(days.map((d) => d.day_index));
    const { data: newDays, error: daysError } = await supabase
      .from("program_days")
      .insert([
        ...days.map((d) => ({
          week_id: weekId!,
          day_index: d.day_index,
          name: d.name,
          focus_note: d.focus_note,
          is_rest: d.is_rest,
        })),
        ...[0, 1, 2, 3, 4, 5, 6]
          .filter((i) => !trainingIndexes.has(i))
          .map((i) => ({
            week_id: weekId!,
            day_index: i,
            name: "Rest",
            focus_note: null,
            is_rest: true,
          })),
      ])
      .select("id, day_index");
    if (daysError) throw daysError;

    const dayIdByIndex = new Map(newDays.map((d) => [d.day_index, d.id]));
    const rows = days.flatMap((day) =>
      [...day.exercises]
        .sort((a, b) => a.position - b.position)
        .map((e, position) => ({
          day_id: dayIdByIndex.get(day.day_index)!,
          exercise_id: e.exercise_id,
          position,
          target_sets: e.target_sets,
          rep_min: e.rep_min,
          rep_max: e.rep_max,
          per_side: e.per_side,
          note: e.note,
          target_weight_kg: e.target_weight_kg,
        })),
    );
    if (rows.length) {
      const { error } = await supabase.from("program_exercises").insert(rows);
      if (error) throw error;
    }

    refresh();
    return { notice: `Assigned ${program.name} — ${rows.length} exercises.` };
  } catch (error) {
    return fail(error);
  }
}
