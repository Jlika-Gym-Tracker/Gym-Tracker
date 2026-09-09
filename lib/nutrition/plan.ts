/**
 * Building a week of meals and turning it into a shopping list.
 * Pure functions — the database layer supplies the rows.
 */

import { addMacros, emptyMacros, macrosForGrams, type MacroTotals } from "./targets";
import { isAllowed, type UserExclude } from "./excludes";

export type Slot = "breakfast" | "lunch" | "pre_workout" | "dinner" | "snack";

/** Which slots to fill for a given meals-per-day setting. */
export function slotsForMealCount(mealsPerDay: number, isTrainingDay: boolean): Slot[] {
  const base: Slot[] = ["breakfast", "lunch", "dinner"];
  if (mealsPerDay <= 3) return base;
  if (mealsPerDay === 4) {
    // The fourth meal is fuel before training, or a snack on a rest day.
    return isTrainingDay
      ? ["breakfast", "lunch", "pre_workout", "dinner"]
      : ["breakfast", "lunch", "dinner", "snack"];
  }
  return isTrainingDay
    ? ["breakfast", "lunch", "pre_workout", "dinner", "snack"]
    : ["breakfast", "lunch", "dinner", "snack", "snack"];
}

/**
 * Structurally compatible with RecipeLike (so the exclude filter accepts it)
 * without extending it — inheriting the narrower ingredient row would hide
 * `grams` behind an intersection.
 */
export type PlannableRecipe = {
  id: string;
  slug: string;
  name: string;
  slot_hint: Slot | null;
  prep_minutes: number | null;
  image_url: string | null;
  steps: string[];
  ingredients: {
    grams: number;
    ingredient: {
      id: string;
      slug: string;
      name: string;
      category: string;
      allergens: string[];
      unit_hint: string;
      image_url: string | null;
      kcal_per_100g: number;
      protein_g: number;
      carb_g: number;
      fat_g: number;
    };
  }[];
};

export function recipeMacros(recipe: PlannableRecipe, servings = 1): MacroTotals {
  return recipe.ingredients.reduce(
    (total, row) =>
      addMacros(total, macrosForGrams(row.ingredient, row.grams * servings)),
    emptyMacros(),
  );
}

export type PlannedEntry = {
  plannedOn: string;
  slot: Slot;
  recipeId: string;
  servings: number;
};

/**
 * Fills every slot of every day, rotating through the allowed recipes for that
 * slot so the week is varied rather than the same meal seven times.
 *
 * Deterministic: the same inputs always produce the same plan, which keeps the
 * "regenerate" button honest and makes this testable.
 */
export function buildWeekPlan({
  dates,
  recipes,
  excludes,
  mealsPerDay,
  trainingDayIndexes,
}: {
  dates: string[];
  recipes: PlannableRecipe[];
  excludes: UserExclude[];
  mealsPerDay: number;
  trainingDayIndexes: number[];
}): PlannedEntry[] {
  const allowed = recipes.filter((r) => isAllowed(r, excludes));
  const entries: PlannedEntry[] = [];
  // Independent rotation per slot, so breakfast varying does not shift dinner.
  const cursor = new Map<Slot, number>();

  dates.forEach((date, dayIndex) => {
    const isTraining = trainingDayIndexes.includes(dayIndex);
    const slots = slotsForMealCount(mealsPerDay, isTraining);

    slots.forEach((slot, slotPosition) => {
      const pool = allowed.filter((r) => r.slot_hint === slot);
      // Fall back to anything allowed rather than leaving a hole in the day.
      const candidates = pool.length > 0 ? pool : allowed;
      if (candidates.length === 0) return;

      const index = (cursor.get(slot) ?? 0) % candidates.length;
      cursor.set(slot, index + 1);

      entries.push({
        plannedOn: date,
        // A second snack in a five-meal day would collide on (plan, date, slot).
        slot: slotPosition > 0 && slots.indexOf(slot) !== slotPosition ? "snack" : slot,
        recipeId: candidates[index]!.id,
        servings: 1,
      });
    });
  });

  // Guard the unique (plan_id, planned_on, slot) constraint.
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.plannedOn}:${e.slot}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type GroceryLine = {
  ingredientId: string;
  slug: string;
  name: string;
  category: string;
  unitHint: string;
  totalGrams: number;
};

/**
 * Aggregates every ingredient across a week's meals.
 *
 * This is what makes it a grocery list rather than a pile of recipes: 200g of
 * chicken in three meals becomes one 600g line.
 */
export function aggregateGroceries(
  entries: { recipeId: string; servings: number }[],
  recipesById: Map<string, PlannableRecipe>,
): GroceryLine[] {
  const totals = new Map<string, GroceryLine>();

  for (const entry of entries) {
    const recipe = recipesById.get(entry.recipeId);
    if (!recipe) continue;
    for (const row of recipe.ingredients) {
      const existing = totals.get(row.ingredient.id);
      const grams = row.grams * entry.servings;
      if (existing) {
        existing.totalGrams += grams;
      } else {
        totals.set(row.ingredient.id, {
          ingredientId: row.ingredient.id,
          slug: row.ingredient.slug,
          name: row.ingredient.name,
          category: row.ingredient.category,
          unitHint: row.ingredient.unit_hint,
          totalGrams: grams,
        });
      }
    }
  }

  return [...totals.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

/** "1.6 kg", "18", "500 ml" — how a line should read on the list. */
export function formatQuantity(line: GroceryLine): string {
  if (line.unitHint === "unit") {
    // Unit foods are stored as grams of a typical item; round up to whole items.
    const perItem = line.slug === "eggs" ? 50 : 120;
    return String(Math.max(1, Math.ceil(line.totalGrams / perItem)));
  }
  if (line.unitHint === "ml") {
    return line.totalGrams >= 1000
      ? `${(line.totalGrams / 1000).toFixed(1).replace(/\.0$/, "")} l`
      : `${Math.round(line.totalGrams)} ml`;
  }
  return line.totalGrams >= 1000
    ? `${(line.totalGrams / 1000).toFixed(1).replace(/\.0$/, "")} kg`
    : `${Math.round(line.totalGrams)} g`;
}

/**
 * Ingredients ordered by how much of the meal they actually are.
 *
 * Seed order is arbitrary, and reading "8 ml olive oil · 5 g mixed spices"
 * before the 200 g of chicken tells you nothing about what you are eating.
 * Heaviest first, with the protein promoted — that is the line people scan.
 */
export function orderedIngredients<T extends {
  grams: number;
  ingredient: { category: string };
}>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const proteinFirst =
      Number(b.ingredient.category === "protein") - Number(a.ingredient.category === "protein");
    return proteinFirst || b.grams - a.grams;
  });
}

/**
 * How much of one ingredient is on the plate.
 *
 * Distinct from formatQuantity, which rounds *up* because a shopping list
 * should never send you home short. A portion rounds to nearest — telling
 * someone to eat 3 eggs when the recipe says 2.6 is right; telling them 3 when
 * it says 2.1 is not.
 */
export function formatPortion(
  grams: number,
  unitHint: string,
  slug?: string,
): string {
  if (unitHint === "unit") {
    const perItem = slug === "eggs" ? 50 : 120;
    const count = Math.max(1, Math.round(grams / perItem));
    return String(count);
  }
  if (unitHint === "ml") {
    return grams >= 1000
      ? `${(grams / 1000).toFixed(1).replace(/\.0$/, "")} l`
      : `${Math.round(grams)} ml`;
  }
  return grams >= 1000
    ? `${(grams / 1000).toFixed(2).replace(/0$/, "").replace(/\.$/, "")} kg`
    : `${Math.round(grams)} g`;
}

/** "3 eggs" / "200 g" — the portion with its noun, for a plain-text recipe. */
export function portionLine(row: {
  grams: number;
  ingredient: { name: string; unit_hint: string; slug: string };
}, servings = 1): string {
  const amount = formatPortion(row.grams * servings, row.ingredient.unit_hint, row.ingredient.slug);
  return row.ingredient.unit_hint === "unit"
    ? `${amount} × ${row.ingredient.name}`
    : `${amount} ${row.ingredient.name.toLowerCase()}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  protein: "Protein",
  carbs: "Carbs",
  produce: "Produce",
  dairy: "Dairy",
  fats: "Fats",
  pantry: "Pantry",
  other: "Other",
};

export const SLOT_LABELS: Record<Slot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  pre_workout: "Pre-workout",
  dinner: "Dinner",
  snack: "Snack",
};
