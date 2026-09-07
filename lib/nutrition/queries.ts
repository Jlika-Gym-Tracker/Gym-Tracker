import "server-only";
import { addDays, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, toDateString } from "@/lib/dates";
import { ageFromBirthDate, calculateTargets, type Targets } from "./targets";
import type { PlannableRecipe, Slot } from "./plan";
import type { UserExclude } from "./excludes";
import type { UserSettings } from "@/lib/database.types";

const RECIPE_SELECT = `
  id, slug, name, slot_hint, prep_minutes, image_url, steps,
  ingredients:recipe_ingredients (
    grams,
    ingredient:ingredients (
      id, slug, name, category, allergens, unit_hint, image_url,
      kcal_per_100g, protein_g, carb_g, fat_g
    )
  )
`;

export async function getRecipes(): Promise<PlannableRecipe[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipes").select(RECIPE_SELECT).order("name");
  if (error) throw error;
  return (data ?? []) as unknown as PlannableRecipe[];
}

export async function getExcludes(): Promise<UserExclude[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("user_excludes").select("kind, value");
  if (error) throw error;
  return (data ?? []) as UserExclude[];
}

export async function getSettings(): Promise<UserSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_settings").select("*").maybeSingle();
  return data;
}

/** Which inputs the calorie formula is still waiting on. */
export type MissingTargetInput = "sex" | "birth_date" | "height" | "weight";

export type TargetsResult =
  | { ok: true; targets: Targets; trainingDays: number[] }
  | { ok: false; missing: MissingTargetInput[] };

/**
 * Targets derived from the profile and settings.
 *
 * Says which inputs are missing rather than just failing, so the screen can
 * name the one thing to fix instead of listing everything it might be.
 */
export async function getTargets(): Promise<TargetsResult> {
  const supabase = await createClient();
  const [{ data: profile }, settings] = await Promise.all([
    supabase
      .from("profiles")
      .select("sex, birth_date, height_cm, goal, activity_factor, training_day_kcal_bonus")
      .maybeSingle(),
    getSettings(),
  ]);
  const { data: weightRow } = await supabase
    .from("body_metrics")
    .select("weight_kg")
    .not("weight_kg", "is", null)
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  const missing: MissingTargetInput[] = [];
  if (!profile?.sex) missing.push("sex");
  if (!profile?.birth_date) missing.push("birth_date");
  if (!profile?.height_cm) missing.push("height");
  if (!weightRow?.weight_kg) missing.push("weight");
  if (missing.length > 0 || !profile) return { ok: false, missing };

  return {
    ok: true,
    targets: calculateTargets({
      weightKg: Number(weightRow!.weight_kg),
      heightCm: Number(profile.height_cm),
      age: ageFromBirthDate(profile.birth_date!),
      sex: profile.sex!,
      activityFactor: Number(profile.activity_factor),
      goal: profile.goal,
      deficitKcal: settings?.deficit_kcal ?? 400,
      proteinGPerKg: Number(settings?.protein_g_per_kg ?? 2.4),
      fatPct: Number(settings?.fat_pct ?? 0.28),
      trainingDayBonusKcal: profile.training_day_kcal_bonus ?? 250,
    }),
    trainingDays: settings?.training_days ?? [0, 1, 3, 4],
  };
}

export type PlanEntryWithRecipe = {
  id: string;
  planned_on: string;
  slot: Slot;
  servings: number;
  eaten: boolean;
  recipe: PlannableRecipe | null;
};

export type WeekPlan = {
  id: string;
  week_start: string;
  entries: PlanEntryWithRecipe[];
  groceries: {
    id: string;
    checked: boolean;
    total_grams: number;
    ingredient: {
      id: string; slug: string; name: string; category: string;
      unit_hint: string; image_url: string | null;
    };
  }[];
};

export async function getWeekPlan(weekStart = currentWeekStart()): Promise<WeekPlan | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_plans")
    .select(
      `id, week_start,
       entries:meal_plan_entries (
         id, planned_on, slot, servings, eaten,
         recipe:recipes ( ${RECIPE_SELECT} )
       ),
       groceries:grocery_items (
         id, checked, total_grams,
         ingredient:ingredients ( id, slug, name, category, unit_hint, image_url )
       )`,
    )
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const plan = data as unknown as WeekPlan;
  plan.entries.sort(
    (a, b) => a.planned_on.localeCompare(b.planned_on) || a.slot.localeCompare(b.slot),
  );
  plan.groceries.sort(
    (a, b) =>
      a.ingredient.category.localeCompare(b.ingredient.category) ||
      a.ingredient.name.localeCompare(b.ingredient.name),
  );
  return plan;
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => toDateString(addDays(parseISO(weekStart), i)));
}
