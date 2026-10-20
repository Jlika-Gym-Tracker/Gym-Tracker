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
      return { notice: `${input.name} is in your library.`, id: data.id };
    }
    return { error: "Could not find a free name for that exercise. Try a slightly different one." };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the form." };
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
