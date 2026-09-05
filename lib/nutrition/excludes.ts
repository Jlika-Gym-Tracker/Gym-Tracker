/**
 * Hard dietary filters.
 *
 * Rule 6 of the brief: a recipe containing an excluded ingredient must never
 * appear in a plan, a swap or a search. This is the single place that decides,
 * so no screen can forget to apply it.
 */

export type ExcludeKind = "allergen" | "ingredient" | "preference";

export type UserExclude = { kind: ExcludeKind; value: string };

export type RecipeLike = {
  id: string;
  name: string;
  ingredients: {
    ingredient: { id: string; slug: string; name: string; allergens: string[] };
  }[];
};

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Preferences (vegetarian, high-protein…) describe what someone wants, not
 * what would hurt them, so they are not part of the hard filter.
 */
export function hardExcludes(excludes: UserExclude[]) {
  return {
    allergens: new Set(
      excludes.filter((e) => e.kind === "allergen").map((e) => normalize(e.value)),
    ),
    ingredients: new Set(
      excludes.filter((e) => e.kind === "ingredient").map((e) => normalize(e.value)),
    ),
  };
}

/** Why a recipe was filtered out, so the UI can explain rather than just hide. */
export function blockedReason(
  recipe: RecipeLike,
  excludes: UserExclude[],
): string | null {
  const { allergens, ingredients } = hardExcludes(excludes);
  if (allergens.size === 0 && ingredients.size === 0) return null;

  for (const row of recipe.ingredients) {
    const ing = row.ingredient;
    if (ingredients.has(normalize(ing.slug)) || ingredients.has(normalize(ing.name))) {
      return `Contains ${ing.name}`;
    }
    for (const allergen of ing.allergens ?? []) {
      if (allergens.has(normalize(allergen))) {
        return `Contains ${allergen}`;
      }
    }
  }
  return null;
}

export function isAllowed(recipe: RecipeLike, excludes: UserExclude[]): boolean {
  return blockedReason(recipe, excludes) === null;
}

export function filterRecipes<T extends RecipeLike>(
  recipes: T[],
  excludes: UserExclude[],
): T[] {
  return recipes.filter((r) => isAllowed(r, excludes));
}

export const COMMON_ALLERGENS = [
  "Dairy", "Eggs", "Gluten", "Peanuts", "Tree nuts",
  "Shellfish", "Fish", "Soy", "Sesame",
] as const;

export const COMMON_PREFERENCES = [
  "Vegetarian", "Pescatarian", "Halal", "No pork", "Low lactose", "Quick meals",
] as const;
