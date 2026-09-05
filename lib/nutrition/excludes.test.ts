import { describe, expect, it } from "vitest";
import { blockedReason, filterRecipes, isAllowed, type RecipeLike } from "./excludes";

const ing = (slug: string, name: string, allergens: string[] = []) => ({
  ingredient: { id: slug, slug, name, allergens },
});

const OMELETTE: RecipeLike = {
  id: "r1",
  name: "Three-egg omelette",
  ingredients: [ing("eggs", "Eggs", ["Eggs"]), ing("spinach", "Spinach")],
};

const CHICKEN_RICE: RecipeLike = {
  id: "r2",
  name: "Chicken and rice",
  ingredients: [ing("chicken-breast", "Chicken breast"), ing("basmati-rice", "Basmati rice")],
};

const PRAWN_STIRFRY: RecipeLike = {
  id: "r3",
  name: "Prawn stir fry",
  ingredients: [ing("prawns", "Prawns", ["Shellfish"]), ing("soy-sauce", "Soy sauce", ["Soy", "Gluten"])],
};

describe("hard filters", () => {
  it("lets everything through when nothing is excluded", () => {
    expect(filterRecipes([OMELETTE, CHICKEN_RICE, PRAWN_STIRFRY], [])).toHaveLength(3);
  });

  it("blocks a recipe on an allergen and says which", () => {
    const excludes = [{ kind: "allergen" as const, value: "Shellfish" }];
    expect(isAllowed(PRAWN_STIRFRY, excludes)).toBe(false);
    expect(blockedReason(PRAWN_STIRFRY, excludes)).toBe("Contains Shellfish");
    expect(isAllowed(CHICKEN_RICE, excludes)).toBe(true);
  });

  it("blocks on an excluded ingredient by slug or by name", () => {
    expect(isAllowed(CHICKEN_RICE, [{ kind: "ingredient", value: "basmati-rice" }])).toBe(false);
    expect(isAllowed(CHICKEN_RICE, [{ kind: "ingredient", value: "Basmati rice" }])).toBe(false);
  });

  it("ignores case and stray whitespace", () => {
    expect(isAllowed(OMELETTE, [{ kind: "allergen", value: "  eGGs " }])).toBe(false);
  });

  it("treats preferences as soft — they never hide food", () => {
    expect(isAllowed(PRAWN_STIRFRY, [{ kind: "preference", value: "Vegetarian" }])).toBe(true);
  });

  it("reports the first offending ingredient when several match", () => {
    const excludes = [
      { kind: "allergen" as const, value: "Soy" },
      { kind: "allergen" as const, value: "Shellfish" },
    ];
    expect(blockedReason(PRAWN_STIRFRY, excludes)).toBe("Contains Shellfish");
  });

  it("filters a list down to what is safe", () => {
    const safe = filterRecipes(
      [OMELETTE, CHICKEN_RICE, PRAWN_STIRFRY],
      [{ kind: "allergen", value: "Eggs" }, { kind: "allergen", value: "Shellfish" }],
    );
    expect(safe.map((r) => r.id)).toEqual(["r2"]);
  });
});
