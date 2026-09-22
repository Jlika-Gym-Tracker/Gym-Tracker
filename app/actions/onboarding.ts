"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { displayToCm, displayToKg } from "@/lib/units";
import { toDateString } from "@/lib/dates";

export type ActionState = { error?: string; notice?: string };

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

const schema = z.object({
  displayName: z.string().trim().min(2).max(60),
  sex: z.enum(["male", "female", "other"]),
  birthYear: z.coerce.number().int().min(1920).max(new Date().getFullYear() - 12),
  unitSystem: z.enum(["metric", "imperial"]),
  height: z.coerce.number().min(80).max(300),
  weight: z.coerce.number().min(30).max(500),
  goal: z.enum(["cut", "bulk", "recomp", "strength", "health"]),
  activityFactor: z.coerce.number().min(1.2).max(2),
  allergens: z.array(z.string().trim().max(60)),
  preferences: z.array(z.string().trim().max(60)),
  mealsPerDay: z.coerce.number().int().min(3).max(5),
  trainingDays: z.array(z.coerce.number().int().min(0).max(6)).min(1),
});

/**
 * Writes everything the five onboarding steps collected, in one go.
 *
 * Onboarding is resumable because each step lives in the client until the end —
 * a half-finished profile would leave the nutrition screen computing targets
 * from partial data.
 */
export async function completeOnboarding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = schema.parse({
      displayName: formData.get("displayName"),
      sex: formData.get("sex"),
      birthYear: formData.get("birthYear"),
      unitSystem: formData.get("unitSystem"),
      height: formData.get("height"),
      weight: formData.get("weight"),
      goal: formData.get("goal"),
      activityFactor: formData.get("activityFactor"),
      allergens: formData.getAll("allergens").map(String),
      preferences: formData.getAll("preferences").map(String),
      mealsPerDay: formData.get("mealsPerDay"),
      trainingDays: formData.getAll("trainingDays"),
    });

    const heightCm = displayToCm(input.height, input.unitSystem);
    const weightKg = displayToKg(input.weight, input.unitSystem);

    // These are separate PostgREST calls with no shared transaction, so
    // onboarded_at is written last, on its own. Marking someone onboarded
    // before their weigh-in lands strands them: they never see this flow again
    // and every screen that needs a bodyweight sits empty with no way back.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        display_name: input.displayName,
        sex: input.sex,
        // Only a birth year is asked for; the formula needs nothing finer.
        birth_date: `${input.birthYear}-07-01`,
        height_cm: Math.round(heightCm * 10) / 10,
        unit_system: input.unitSystem,
        goal: input.goal,
        activity_factor: input.activityFactor,
      })
      .eq("id", user.id);
    if (profileError) throw profileError;

    // The starting weigh-in doubles as the first point on the trend.
    const { error: metricError } = await supabase.from("body_metrics").upsert(
      {
        user_id: user.id,
        measured_on: toDateString(new Date()),
        weight_kg: Math.round(weightKg * 100) / 100,
      },
      { onConflict: "user_id,measured_on" },
    );
    if (metricError) throw metricError;

    const { error: settingsError } = await supabase.from("user_settings").upsert(
      {
        user_id: user.id,
        meals_per_day: input.mealsPerDay,
        training_days: [...new Set(input.trainingDays)].sort(),
      },
      { onConflict: "user_id" },
    );
    if (settingsError) throw settingsError;

    // Replace excludes wholesale — onboarding is the full picture, not a diff.
    await supabase.from("user_excludes").delete().eq("user_id", user.id);
    const excludes = [
      ...input.allergens.map((value) => ({ user_id: user.id, kind: "allergen", value })),
      ...input.preferences.map((value) => ({ user_id: user.id, kind: "preference", value })),
    ];
    if (excludes.length) await supabase.from("user_excludes").insert(excludes);

    // Last, now that everything it implies actually exists.
    const { error: doneError } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", user.id);
    if (doneError) throw doneError;

    revalidatePath("/", "layout");
  } catch (error) {
    return fail(error);
  }
  redirect("/program?from=onboarding");
}

export async function skipOnboarding(): Promise<void> {
  const { supabase, user } = await requireUser();
  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

const coachSchema = z.object({
  displayName: z.string().trim().min(2, "Your name needs at least 2 characters.").max(60),
  gymName: z
    .union([z.literal(""), z.string().trim().max(80)])
    .transform((v) => v || null),
});

/**
 * The short first run for someone who came in to coach.
 *
 * A coach who does not train here has no reason to give their own height, sex
 * or goal — those exist only to compute their calories. They can add all of it
 * later from Profile → "I train here too", which reopens the full flow.
 */
export async function completeCoachOnboarding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = coachSchema.parse({
      displayName: formData.get("displayName"),
      gymName: formData.get("gymName") ?? "",
    });

    // One UPDATE, so unlike completeOnboarding there is no ordering hazard —
    // nothing else has to exist for onboarded_at to be honest here.
    // coaching_enabled is set again because someone can reach this screen
    // through a magic link that never carried the signup metadata.
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: input.displayName,
        gym_name: input.gymName,
        coaching_enabled: true,
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) throw error;

    revalidatePath("/", "layout");
  } catch (error) {
    return fail(error);
  }
  redirect("/coach");
}
