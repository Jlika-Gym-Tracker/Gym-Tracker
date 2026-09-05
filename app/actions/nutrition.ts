"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/dates";
import { aggregateGroceries, buildWeekPlan } from "@/lib/nutrition/plan";
import {
  getExcludes,
  getRecipes,
  getSettings,
  weekDates,
} from "@/lib/nutrition/queries";
import { isAllowed } from "@/lib/nutrition/excludes";

export type ActionState = { error?: string; notice?: string };

const uuid = z.uuid();
const weekStartSchema = z.iso.date();

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
  revalidatePath("/nutrition");
  revalidatePath("/");
}

/**
 * Builds (or rebuilds) a week of meals and the shopping list that follows from
 * it. Regenerating replaces the week wholesale — a half-old, half-new plan
 * would produce a grocery list matching neither.
 */
export async function generateWeekPlan(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const weekStart = weekStartSchema.parse(
      formData.get("weekStart") ?? currentWeekStart(),
    );

    const [recipes, excludes, settings] = await Promise.all([
      getRecipes(),
      getExcludes(),
      getSettings(),
    ]);

    const safe = recipes.filter((r) => isAllowed(r, excludes));
    if (safe.length === 0) {
      return {
        error:
          "Every recipe in the library clashes with your allergies or excludes. Loosen one, or add your own recipes.",
      };
    }

    const { data: plan, error: planError } = await supabase
      .from("meal_plans")
      .upsert({ user_id: user.id, week_start: weekStart }, { onConflict: "user_id,week_start" })
      .select("id")
      .single();
    if (planError) throw planError;

    await supabase.from("meal_plan_entries").delete().eq("plan_id", plan.id);
    await supabase.from("grocery_items").delete().eq("plan_id", plan.id);

    const entries = buildWeekPlan({
      dates: weekDates(weekStart),
      recipes,
      excludes,
      mealsPerDay: settings?.meals_per_day ?? 4,
      trainingDayIndexes: settings?.training_days ?? [0, 1, 3, 4],
    });

    if (entries.length === 0) return { error: "Could not fill any meal slots." };

    const { error: entryError } = await supabase.from("meal_plan_entries").insert(
      entries.map((e) => ({
        plan_id: plan.id,
        planned_on: e.plannedOn,
        slot: e.slot,
        recipe_id: e.recipeId,
        servings: e.servings,
      })),
    );
    if (entryError) throw entryError;

    await rebuildGroceries(plan.id);

    refresh();
    return { notice: `Planned ${entries.length} meals for the week.` };
  } catch (error) {
    return fail(error);
  }
}

/** Recomputes the shopping list from whatever the plan currently holds. */
async function rebuildGroceries(planId: string) {
  const { supabase } = await requireUser();

  const [{ data: entries }, recipes] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .select("recipe_id, servings")
      .eq("plan_id", planId),
    getRecipes(),
  ]);

  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const lines = aggregateGroceries(
    (entries ?? [])
      .filter((e): e is { recipe_id: string; servings: number } => Boolean(e.recipe_id))
      .map((e) => ({ recipeId: e.recipe_id, servings: Number(e.servings) })),
    recipesById,
  );

  // Keep whatever is already ticked off, so a regenerate does not empty the basket.
  const { data: existing } = await supabase
    .from("grocery_items")
    .select("ingredient_id, checked")
    .eq("plan_id", planId);
  const checkedBefore = new Set(
    (existing ?? []).filter((g) => g.checked).map((g) => g.ingredient_id),
  );

  await supabase.from("grocery_items").delete().eq("plan_id", planId);
  if (lines.length === 0) return;

  await supabase.from("grocery_items").insert(
    lines.map((line) => ({
      plan_id: planId,
      ingredient_id: line.ingredientId,
      total_grams: Math.round(line.totalGrams * 10) / 10,
      checked: checkedBefore.has(line.ingredientId),
    })),
  );
}

export async function toggleMealEaten(entryId: string, eaten: boolean): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("meal_plan_entries")
      .update({ eaten })
      .eq("id", uuid.parse(entryId));
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

export async function toggleGroceryItem(itemId: string, checked: boolean): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("grocery_items")
      .update({ checked })
      .eq("id", uuid.parse(itemId));
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/**
 * Swaps one meal for another recipe in the same slot.
 * Re-checks the excludes server-side — the client list could be stale.
 */
export async function swapMeal(entryId: string, recipeId: string): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    uuid.parse(entryId);
    uuid.parse(recipeId);

    const [recipes, excludes] = await Promise.all([getRecipes(), getExcludes()]);
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) return { error: "That recipe no longer exists." };
    if (!isAllowed(recipe, excludes)) {
      return { error: `${recipe.name} clashes with your allergies or excludes.` };
    }

    const { data: entry, error } = await supabase
      .from("meal_plan_entries")
      .update({ recipe_id: recipeId, eaten: false })
      .eq("id", entryId)
      .select("plan_id")
      .single();
    if (error) throw error;

    await rebuildGroceries(entry.plan_id);
    refresh();
    return { notice: `Swapped in ${recipe.name}.` };
  } catch (error) {
    return fail(error);
  }
}

const excludeSchema = z.object({
  kind: z.enum(["allergen", "ingredient", "preference"]),
  value: z.string().trim().min(1).max(60),
});

export async function toggleExclude(
  kind: "allergen" | "ingredient" | "preference",
  value: string,
  on: boolean,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const parsed = excludeSchema.parse({ kind, value });

    if (on) {
      const { error } = await supabase
        .from("user_excludes")
        .upsert({ user_id: user.id, ...parsed }, { onConflict: "user_id,kind,value" });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("user_excludes")
        .delete()
        .eq("kind", parsed.kind)
        .eq("value", parsed.value);
      if (error) throw error;
    }

    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}
