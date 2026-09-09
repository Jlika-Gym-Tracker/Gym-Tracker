import { describe, expect, it } from "vitest";
import {
  aggregateGroceries,
  buildWeekPlan,
  formatPortion,
  formatQuantity,
  orderedIngredients,
  portionLine,
  recipeMacros,
  slotsForMealCount,
  type PlannableRecipe,
} from "./plan";

const ing = (
  slug: string,
  name: string,
  category: string,
  macros: [number, number, number, number],
  allergens: string[] = [],
  unit_hint = "g",
  image_url: string | null = null,
) => ({
  id: slug, slug, name, category, allergens, unit_hint, image_url,
  kcal_per_100g: macros[0], protein_g: macros[1], carb_g: macros[2], fat_g: macros[3],
});

const CHICKEN = ing("chicken-breast", "Chicken breast", "protein", [165, 31, 0, 3.6]);
const RICE = ing("basmati-rice", "Basmati rice", "carbs", [349, 8, 78, 0.9]);
const EGGS = ing("eggs", "Eggs", "protein", [143, 13, 1.1, 9.5], ["Eggs"], "unit");
const OATS = ing("rolled-oats", "Oats", "carbs", [379, 13, 68, 7], ["Gluten"]);

const recipe = (
  id: string,
  slot: PlannableRecipe["slot_hint"],
  items: [ReturnType<typeof ing>, number][],
): PlannableRecipe => ({
  id, slug: id, name: id, slot_hint: slot,
  prep_minutes: 10, image_url: null, steps: [],
  ingredients: items.map(([ingredient, grams]) => ({ ingredient, grams })),
});

const BREAKFAST_A = recipe("oats", "breakfast", [[OATS, 80]]);
const BREAKFAST_B = recipe("omelette", "breakfast", [[EGGS, 150]]);
const LUNCH = recipe("chicken-rice", "lunch", [[CHICKEN, 200], [RICE, 80]]);
const DINNER = recipe("chicken-rice-2", "dinner", [[CHICKEN, 180], [RICE, 70]]);
const ALL = [BREAKFAST_A, BREAKFAST_B, LUNCH, DINNER];
const DATES = ["2026-09-01", "2026-09-02", "2026-09-03"];

describe("slotsForMealCount", () => {
  it("gives three meals the basics", () => {
    expect(slotsForMealCount(3, false)).toEqual(["breakfast", "lunch", "dinner"]);
  });

  it("spends the fourth meal on pre-workout fuel when training", () => {
    expect(slotsForMealCount(4, true)).toContain("pre_workout");
    expect(slotsForMealCount(4, false)).toContain("snack");
  });
});

describe("recipeMacros", () => {
  it("sums its ingredients", () => {
    const m = recipeMacros(LUNCH);
    expect(m.kcal).toBeCloseTo(165 * 2 + 349 * 0.8, 5);
    expect(m.proteinG).toBeCloseTo(31 * 2 + 8 * 0.8, 5);
  });

  it("scales with servings", () => {
    expect(recipeMacros(LUNCH, 2).kcal).toBeCloseTo(recipeMacros(LUNCH).kcal * 2, 5);
  });
});

describe("buildWeekPlan", () => {
  it("fills every slot of every day", () => {
    const plan = buildWeekPlan({
      dates: DATES, recipes: ALL, excludes: [], mealsPerDay: 3, trainingDayIndexes: [0, 1],
    });
    expect(plan).toHaveLength(9);
    expect(new Set(plan.map((e) => e.plannedOn)).size).toBe(3);
  });

  it("rotates recipes rather than repeating one all week", () => {
    const plan = buildWeekPlan({
      dates: DATES, recipes: ALL, excludes: [], mealsPerDay: 3, trainingDayIndexes: [],
    });
    const breakfasts = plan.filter((e) => e.slot === "breakfast").map((e) => e.recipeId);
    expect(new Set(breakfasts).size).toBeGreaterThan(1);
  });

  it("is deterministic", () => {
    const args = {
      dates: DATES, recipes: ALL, excludes: [], mealsPerDay: 3, trainingDayIndexes: [0],
    };
    expect(buildWeekPlan(args)).toEqual(buildWeekPlan(args));
  });

  it("never plans a recipe that breaks a hard exclude", () => {
    const plan = buildWeekPlan({
      dates: DATES, recipes: ALL,
      excludes: [{ kind: "allergen", value: "Eggs" }],
      mealsPerDay: 3, trainingDayIndexes: [],
    });
    expect(plan.some((e) => e.recipeId === "omelette")).toBe(false);
    expect(plan.length).toBe(9);
  });

  it("produces nothing rather than something unsafe when all recipes are excluded", () => {
    const plan = buildWeekPlan({
      dates: DATES, recipes: [BREAKFAST_B],
      excludes: [{ kind: "allergen", value: "Eggs" }],
      mealsPerDay: 3, trainingDayIndexes: [],
    });
    expect(plan).toEqual([]);
  });

  it("never emits two entries for the same day and slot", () => {
    const plan = buildWeekPlan({
      dates: DATES, recipes: ALL, excludes: [], mealsPerDay: 5, trainingDayIndexes: [0, 1, 2],
    });
    const keys = plan.map((e) => `${e.plannedOn}:${e.slot}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("aggregateGroceries", () => {
  const byId = new Map(ALL.map((r) => [r.id, r]));

  it("merges the same ingredient across meals into one line", () => {
    const lines = aggregateGroceries(
      [
        { recipeId: "chicken-rice", servings: 1 },
        { recipeId: "chicken-rice-2", servings: 1 },
      ],
      byId,
    );
    const chicken = lines.find((l) => l.slug === "chicken-breast")!;
    expect(chicken.totalGrams).toBe(380);
    expect(lines).toHaveLength(2);
  });

  it("respects servings", () => {
    const lines = aggregateGroceries([{ recipeId: "chicken-rice", servings: 2 }], byId);
    expect(lines.find((l) => l.slug === "chicken-breast")!.totalGrams).toBe(400);
  });

  it("ignores entries whose recipe is missing", () => {
    expect(aggregateGroceries([{ recipeId: "ghost", servings: 1 }], byId)).toEqual([]);
  });

  it("groups by category then name", () => {
    const lines = aggregateGroceries([{ recipeId: "chicken-rice", servings: 1 }], byId);
    expect(lines.map((l) => l.category)).toEqual(["carbs", "protein"]);
  });
});

describe("formatQuantity", () => {
  const line = (totalGrams: number, unitHint: string, slug = "x") => ({
    ingredientId: slug, slug, name: slug, category: "protein", unitHint, totalGrams,
  });

  it("switches to kilos past a thousand grams", () => {
    expect(formatQuantity(line(1600, "g"))).toBe("1.6 kg");
    expect(formatQuantity(line(700, "g"))).toBe("700 g");
  });

  it("counts unit foods as whole items, rounding up", () => {
    expect(formatQuantity(line(450, "unit", "eggs"))).toBe("9");
    expect(formatQuantity(line(10, "unit", "eggs"))).toBe("1");
  });

  it("uses litres for large volumes", () => {
    expect(formatQuantity(line(1500, "ml"))).toBe("1.5 l");
    expect(formatQuantity(line(500, "ml"))).toBe("500 ml");
  });
});

describe("formatPortion", () => {
  it("rounds to nearest for a plate, unlike the shopping list which rounds up", () => {
    // 2.6 eggs is 3 on a plate; formatQuantity would also say 3, but 2.1 must
    // not become 3 just because you would buy three.
    expect(formatPortion(130, "unit", "eggs")).toBe("3");
    expect(formatPortion(105, "unit", "eggs")).toBe("2");
    expect(formatQuantity({
      ingredientId: "eggs", slug: "eggs", name: "Eggs",
      category: "protein", unitHint: "unit", totalGrams: 105,
    })).toBe("3");
  });

  it("never tells you to eat zero of something", () => {
    expect(formatPortion(10, "unit", "eggs")).toBe("1");
  });

  it("keeps grams and millilitres readable", () => {
    expect(formatPortion(200, "g")).toBe("200 g");
    expect(formatPortion(1200, "g")).toBe("1.2 kg");
    expect(formatPortion(15, "ml")).toBe("15 ml");
  });
});

describe("portionLine", () => {
  const row = {
    grams: 200,
    ingredient: { name: "Chicken breast", unit_hint: "g", slug: "chicken-breast" },
  };

  it("reads as an instruction", () => {
    expect(portionLine(row)).toBe("200 g chicken breast");
  });

  it("scales with servings", () => {
    expect(portionLine(row, 2)).toBe("400 g chicken breast");
    expect(portionLine(row, 0.5)).toBe("100 g chicken breast");
  });

  it("counts unit foods rather than weighing them", () => {
    expect(
      portionLine({ grams: 150, ingredient: { name: "Eggs", unit_hint: "unit", slug: "eggs" } }),
    ).toBe("3 × Eggs");
  });
});

describe("orderedIngredients", () => {
  const oil = { grams: 8, ingredient: { category: "fats", name: "Olive oil" } };
  const spice = { grams: 5, ingredient: { category: "pantry", name: "Spices" } };
  const chicken = { grams: 200, ingredient: { category: "protein", name: "Chicken" } };
  const rice = { grams: 80, ingredient: { category: "carbs", name: "Rice" } };

  it("puts the protein first, then the heaviest", () => {
    expect(
      orderedIngredients([oil, spice, chicken, rice]).map((r) => r.ingredient.name),
    ).toEqual(["Chicken", "Rice", "Olive oil", "Spices"]);
  });

  it("falls back to weight when nothing is a protein", () => {
    expect(orderedIngredients([spice, oil, rice]).map((r) => r.ingredient.name)).toEqual([
      "Rice", "Olive oil", "Spices",
    ]);
  });

  it("does not mutate the input", () => {
    const rows = [oil, chicken];
    orderedIngredients(rows);
    expect(rows[0]).toBe(oil);
  });
});
