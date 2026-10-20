"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ownExerciseSlug } from "@/lib/program/own-exercise";

export type ActionState = { error?: string; notice?: string; id?: string };

const MUSCLES = [
  "chest", "lats", "middle_back", "lower_back", "traps", "shoulders", "biceps",
  "triceps", "forearms", "quadriceps", "hamstrings", "glutes", "calves",
  "abdominals", "abductors", "adductors", "neck",
] as const;

const EQUIPMENT = [
  "barbell", "dumbbell", "machine", "cable", "body_only", "bands", "kettlebells",
  "ez_curl_bar", "exercise_ball", "medicine_ball", "foam_roll", "other",
] as const;

const schema = z.object({
  name: z.string().trim().min(2, "Give it a name of at least two letters.").max(80),
  primaryMuscle: z.enum(MUSCLES, "Pick the muscle it works most."),
  equipment: z.enum(EQUIPMENT),
  tracking: z.enum(["reps", "time", "cardio"]),
  description: z.string().trim().max(600).nullable(),
});

/**
 * Adds a movement of your own. A name and a muscle are enough; it then behaves
 * like a library exercise everywhere — the builder, the session, progression.
 * The optional description stands in for the demo photos a seeded movement has.
 */
export async function createExercise(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const input = schema.parse({
      name: formData.get("name"),
      primaryMuscle: formData.get("primaryMuscle"),
      equipment: formData.get("equipment") || "other",
      tracking: formData.get("tracking") || "reps",
      description: (formData.get("description") as string | null)?.trim() || null,
    });

    const { data: same } = await supabase
      .from("exercises")
      .select("id")
      .eq("owner_id", user.id)
      // ilike without wildcards: a case-insensitive exact match.
      .ilike("name", input.name.replace(/[%_\\]/g, "\\$&"))
      .limit(1);
    if (same?.length) return { error: `You already have an exercise called “${input.name}”.` };

    // Slugs are unique across everyone; a repeat of your own gets a suffix.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from("exercises")
        .insert({
          owner_id: user.id,
          slug: ownExerciseSlug(user.id, input.name, attempt),
          name: input.name,
          primary_muscle: input.primaryMuscle,
          equipment: input.equipment,
          tracking: input.tracking,
          how_to: input.description ? [input.description] : [],
        })
        .select("id")
        .single();
      if (error?.code === "23505") continue;
      if (error) throw error;

      revalidatePath("/program");
      revalidatePath("/exercises", "layout");
      return { notice: `${input.name} is in your library.`, id: data.id };
    }
    return { error: "Could not find a free name for that exercise. Try a slightly different one." };
  } catch (error) {
    return fail(error);
  }
}

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the form." };
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, user };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One of your own movements that is still in your library, or an error saying why not. */
async function ownExercise(supabase: Supabase, userId: string, id: string) {
  const { data, error } = await supabase
    .from("exercises")
    .select("id, slug, name, tracking, archived_at")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("You can only change exercises you added yourself.");
  if (data.archived_at) throw new Error("That exercise was removed from your library.");
  return data;
}

/**
 * Sets of this movement in your own sessions, ticked or not: an unticked row
 * of an unfinished session still points at the exercise.
 */
async function loggedSetCount(supabase: Supabase, userId: string, exerciseId: string) {
  const { count, error } = await supabase
    .from("set_logs")
    .select("id, workout_sessions!inner()", { count: "exact", head: true })
    .eq("workout_sessions.user_id", userId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
  return count ?? 0;
}

const updateSchema = schema.extend({ id: z.uuid() });

/**
 * Edits one of your own movements. The slug, and so its page's address,
 * stays put. How it is logged cannot change once sets exist: a set logged as
 * reps read back as a hold (or the other way round) would turn every number
 * drawn from it into nonsense.
 */
export async function updateExercise(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = updateSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      primaryMuscle: formData.get("primaryMuscle"),
      equipment: formData.get("equipment") || "other",
      tracking: formData.get("tracking") || "reps",
      description: (formData.get("description") as string | null)?.trim() || null,
    });
    const current = await ownExercise(supabase, user.id, input.id);

    const { data: same } = await supabase
      .from("exercises")
      .select("id")
      .eq("owner_id", user.id)
      .is("archived_at", null)
      .neq("id", input.id)
      // ilike without wildcards: a case-insensitive exact match.
      .ilike("name", input.name.replace(/[%_\\]/g, "\\$&"))
      .limit(1);
    if (same?.length) return { error: `You already have an exercise called “${input.name}”.` };

    if (input.tracking !== current.tracking && (await loggedSetCount(supabase, user.id, input.id)) > 0) {
      return { error: "It already has logged sets, so how it is logged has to stay the same." };
    }

    const { error } = await supabase
      .from("exercises")
      .update({
        name: input.name,
        primary_muscle: input.primaryMuscle,
        equipment: input.equipment,
        tracking: input.tracking,
        how_to: input.description ? [input.description] : [],
      })
      .eq("id", input.id)
      .eq("owner_id", user.id);
    if (error) throw error;

    revalidatePath("/exercises", "layout");
    revalidatePath("/program");
    return { notice: "Saved.", id: input.id };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Removes one of your own movements from your library.
 *
 * With logged sets it is archived, not deleted: it leaves the library and the
 * pickers, while history, summaries and charts keep reading its name. With
 * nothing logged it is deleted outright — unless something still points at it
 * (a plan you wrote, a coach program), in which case it is archived too, and
 * stays in those plans as it was.
 */
export async function removeExercise(
  exerciseId: string,
): Promise<ActionState & { archived?: boolean }> {
  try {
    const { supabase, user } = await requireUser();
    const id = z.uuid().parse(exerciseId);
    const exercise = await ownExercise(supabase, user.id, id);

    const archive = async () => {
      const { error } = await supabase
        .from("exercises")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", user.id);
      if (error) throw error;
    };

    let archived = (await loggedSetCount(supabase, user.id, id)) > 0;
    if (archived) {
      await archive();
    } else {
      const { error } = await supabase.from("exercises").delete().eq("id", id).eq("owner_id", user.id);
      // 23503: still referenced — by a plan, or by a set this account cannot see.
      if (error?.code === "23503") {
        await archive();
        archived = true;
      } else if (error) {
        throw error;
      }
    }

    revalidatePath("/exercises", "layout");
    revalidatePath("/program");
    return {
      archived,
      notice: archived
        ? `${exercise.name} is out of your library. Its history stays.`
        : `${exercise.name} is deleted.`,
    };
  } catch (error) {
    return fail(error);
  }
}
