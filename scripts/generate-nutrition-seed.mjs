import fs from "node:fs";

// Per-100g values from public nutrition tables (USDA / CIQUAL), rounded.
const INGREDIENTS = [
  // slug, name, category, kcal, protein, carb, fat, allergens, unit hint
  ["chicken-breast", "Chicken breast", "protein", 165, 31, 0, 3.6, [], "g"],
  ["salmon-fillet", "Salmon fillet", "protein", 208, 20, 0, 13, ["Fish"], "g"],
  ["lean-beef-mince", "Lean beef mince 5%", "protein", 137, 21, 0, 5, [], "g"],
  ["turkey-mince", "Turkey mince", "protein", 148, 21, 0, 7, [], "g"],
  ["eggs", "Eggs", "protein", 143, 13, 1.1, 9.5, ["Eggs"], "unit"],
  ["egg-whites", "Egg whites", "protein", 52, 11, 0.7, 0.2, ["Eggs"], "g"],
  ["greek-yogurt", "Greek yogurt 0%", "dairy", 59, 10, 3.6, 0.4, ["Dairy"], "g"],
  ["cottage-cheese", "Cottage cheese", "dairy", 98, 11, 3.4, 4.3, ["Dairy"], "g"],
  ["whey-protein", "Whey protein", "protein", 380, 80, 8, 4, ["Dairy"], "g"],
  ["tofu-firm", "Firm tofu", "protein", 144, 17, 3, 9, ["Soy"], "g"],
  ["prawns", "Prawns", "protein", 99, 24, 0.2, 0.3, ["Shellfish"], "g"],
  ["tuna-tinned", "Tinned tuna in water", "protein", 116, 26, 0, 1, ["Fish"], "g"],
  ["basmati-rice", "Basmati rice (dry)", "carbs", 349, 8, 78, 0.9, [], "g"],
  ["rolled-oats", "Rolled oats", "carbs", 379, 13, 68, 7, ["Gluten"], "g"],
  ["sweet-potato", "Sweet potato", "carbs", 86, 1.6, 20, 0.1, [], "g"],
  ["potato", "Potato", "carbs", 77, 2, 17, 0.1, [], "g"],
  ["wholemeal-bread", "Wholemeal bread", "carbs", 247, 13, 41, 3.4, ["Gluten"], "g"],
  ["wholewheat-pasta", "Wholewheat pasta (dry)", "carbs", 348, 14, 67, 2.5, ["Gluten"], "g"],
  ["couscous", "Couscous (dry)", "carbs", 376, 13, 77, 0.6, ["Gluten"], "g"],
  ["chickpeas", "Chickpeas (cooked)", "carbs", 164, 9, 27, 2.6, [], "g"],
  ["black-beans", "Black beans (cooked)", "carbs", 132, 9, 24, 0.5, [], "g"],
  ["broccoli", "Broccoli", "produce", 34, 2.8, 7, 0.4, [], "g"],
  ["spinach", "Spinach", "produce", 23, 2.9, 3.6, 0.4, [], "g"],
  ["tomatoes", "Tomatoes", "produce", 18, 0.9, 3.9, 0.2, [], "unit"],
  ["mixed-peppers", "Mixed peppers", "produce", 31, 1, 6, 0.3, [], "g"],
  ["courgette", "Courgette", "produce", 17, 1.2, 3.1, 0.3, [], "g"],
  ["onion", "Onion", "produce", 40, 1.1, 9.3, 0.1, [], "unit"],
  ["garlic", "Garlic", "produce", 149, 6.4, 33, 0.5, [], "g"],
  ["banana", "Bananas", "produce", 89, 1.1, 23, 0.3, [], "unit"],
  ["berries-frozen", "Frozen berries", "produce", 50, 1, 11, 0.3, [], "g"],
  ["apple", "Apples", "produce", 52, 0.3, 14, 0.2, [], "unit"],
  ["avocado", "Avocado", "fats", 160, 2, 9, 15, [], "unit"],
  ["olive-oil", "Olive oil", "fats", 884, 0, 0, 100, [], "ml"],
  ["almonds", "Almonds", "fats", 579, 21, 22, 50, ["Tree nuts"], "g"],
  ["peanut-butter", "Peanut butter", "fats", 588, 25, 20, 50, ["Peanuts"], "g"],
  ["soy-sauce", "Soy sauce", "pantry", 53, 8, 5, 0.1, ["Soy", "Gluten"], "ml"],
  ["honey", "Honey", "pantry", 304, 0.3, 82, 0, [], "g"],
  ["mixed-spices", "Mixed spices", "pantry", 250, 10, 45, 8, [], "g"],
];

// name, slug, slot, prep minutes, [[ingredient slug, grams], ...], steps
const RECIPES = [
  ["Protein oats with berries", "protein-oats", "breakfast", 8,
    [["rolled-oats", 80], ["whey-protein", 30], ["berries-frozen", 100], ["peanut-butter", 15]],
    ["Simmer the oats in water until thick.", "Stir the protein through off the heat.", "Top with berries and peanut butter."]],
  ["Greek yogurt, berries and almonds", "yogurt-bowl", "breakfast", 3,
    [["greek-yogurt", 250], ["berries-frozen", 100], ["almonds", 20], ["honey", 10]],
    ["Spoon the yogurt into a bowl.", "Top with berries, almonds and honey."]],
  ["Three-egg omelette with spinach", "spinach-omelette", "breakfast", 10,
    [["eggs", 150], ["egg-whites", 100], ["spinach", 80], ["olive-oil", 5]],
    ["Wilt the spinach in the oil.", "Pour in the beaten eggs and whites.", "Fold once the base is set."]],
  ["Chicken, rice and broccoli", "chicken-rice-broccoli", "lunch", 25,
    [["chicken-breast", 200], ["basmati-rice", 80], ["broccoli", 200], ["olive-oil", 8], ["mixed-spices", 5]],
    ["Cook the rice.", "Season and pan-fry the chicken.", "Steam the broccoli and plate together."]],
  ["Tuna and chickpea salad", "tuna-chickpea-salad", "lunch", 8,
    [["tuna-tinned", 160], ["chickpeas", 150], ["tomatoes", 120], ["olive-oil", 10], ["spinach", 60]],
    ["Drain the tuna and chickpeas.", "Toss everything with the oil and season."]],
  ["Turkey and sweet potato bowl", "turkey-sweet-potato", "lunch", 30,
    [["turkey-mince", 180], ["sweet-potato", 250], ["mixed-peppers", 120], ["olive-oil", 8]],
    ["Roast the sweet potato.", "Brown the turkey with the peppers.", "Combine and season."]],
  ["Beef and black bean bowl", "beef-black-bean", "dinner", 25,
    [["lean-beef-mince", 180], ["black-beans", 150], ["mixed-peppers", 120], ["basmati-rice", 70], ["mixed-spices", 5]],
    ["Brown the mince.", "Add beans, peppers and spices.", "Serve over rice."]],
  ["Salmon, potatoes and greens", "salmon-potato", "dinner", 30,
    [["salmon-fillet", 180], ["potato", 300], ["broccoli", 150], ["olive-oil", 8]],
    ["Roast the potatoes.", "Bake the salmon for 14 minutes.", "Steam the greens."]],
  ["Chicken pasta with tomatoes", "chicken-pasta", "dinner", 22,
    [["chicken-breast", 180], ["wholewheat-pasta", 90], ["tomatoes", 200], ["olive-oil", 10], ["garlic", 8]],
    ["Boil the pasta.", "Cook the chicken with garlic and tomatoes.", "Toss together."]],
  ["Tofu and vegetable stir fry", "tofu-stirfry", "dinner", 20,
    [["tofu-firm", 200], ["mixed-peppers", 150], ["courgette", 150], ["soy-sauce", 20], ["basmati-rice", 70]],
    ["Press and cube the tofu.", "Stir fry hot and fast with the vegetables.", "Finish with soy sauce over rice."]],
  ["Prawn and courgette pasta", "prawn-pasta", "dinner", 18,
    [["prawns", 180], ["wholewheat-pasta", 90], ["courgette", 150], ["garlic", 8], ["olive-oil", 10]],
    ["Boil the pasta.", "Sauté the prawns with garlic and courgette.", "Combine."]],
  ["Banana and peanut butter toast", "pb-toast", "pre_workout", 5,
    [["wholemeal-bread", 80], ["peanut-butter", 20], ["banana", 120]],
    ["Toast the bread.", "Spread and top with sliced banana."]],
  ["Rice cakes and whey", "pre-workout-shake", "pre_workout", 2,
    [["whey-protein", 30], ["banana", 120], ["honey", 10]],
    ["Blend the whey with water.", "Eat the banana alongside."]],
  ["Cottage cheese and apple", "cottage-apple", "snack", 3,
    [["cottage-cheese", 200], ["apple", 150], ["almonds", 15]],
    ["Spoon out the cottage cheese.", "Slice the apple and add the almonds."]],
  ["Protein shake", "protein-shake", "snack", 2,
    [["whey-protein", 30], ["greek-yogurt", 150]],
    ["Blend with water and ice."]],
];

const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => (a && a.length ? `array[${a.map(q).join(",")}]::text[]` : `'{}'::text[]`);

const ingredientValues = INGREDIENTS.map(
  ([slug, name, cat, kcal, p, c, f, allergens, unit]) =>
    `  (${q(slug)}, ${q(name)}, ${q(cat)}, ${kcal}, ${p}, ${c}, ${f}, ${arr(allergens)}, ${q(unit)})`,
).join(",\n");

const recipeValues = RECIPES.map(
  ([name, slug, slot, prep, , steps]) =>
    `  (${q(slug)}, ${q(name)}, ${q(slot)}, ${prep}, ${arr(steps)})`,
).join(",\n");

const linkValues = RECIPES.flatMap(([, slug, , , items]) =>
  items.map(
    ([ingredientSlug, grams]) =>
      `  ((select id from public.recipes where slug = ${q(slug)}), (select id from public.ingredients where slug = ${q(ingredientSlug)}), ${grams})`,
  ),
).join(",\n");

const missing = RECIPES.flatMap(([name, , , , items]) =>
  items.filter(([s]) => !INGREDIENTS.some((i) => i[0] === s)).map(([s]) => `${name} → ${s}`),
);
if (missing.length) {
  console.error("Recipe references an unknown ingredient:", missing.join(", "));
  process.exit(1);
}

// NOTE: ingredient photos live in 20260907000014_ingredient_images.sql, which
// runs after this and fills image_url by slug. Regenerating this file does not
// drop them — the column is not touched here.

const sql = `-- JLIKA Gym — Phase 5 seed: ingredients and recipes.
--
-- Per-100g values are from public nutrition tables (USDA / CIQUAL), rounded.
-- owner_id stays null so every account can read them but nobody can edit them.
-- Re-runnable: conflicts on slug refresh the row.

insert into public.ingredients
  (slug, name, category, kcal_per_100g, protein_g, carb_g, fat_g, allergens, unit_hint)
values
${ingredientValues}
on conflict (slug) do update set
  name = excluded.name, category = excluded.category,
  kcal_per_100g = excluded.kcal_per_100g, protein_g = excluded.protein_g,
  carb_g = excluded.carb_g, fat_g = excluded.fat_g,
  allergens = excluded.allergens, unit_hint = excluded.unit_hint;

insert into public.recipes (slug, name, slot_hint, prep_minutes, steps)
values
${recipeValues}
on conflict (slug) do update set
  name = excluded.name, slot_hint = excluded.slot_hint,
  prep_minutes = excluded.prep_minutes, steps = excluded.steps;

-- Rebuild the links so a changed recipe does not keep stale ingredients.
delete from public.recipe_ingredients
where recipe_id in (select id from public.recipes where owner_id is null);

insert into public.recipe_ingredients (recipe_id, ingredient_id, grams)
values
${linkValues}
on conflict (recipe_id, ingredient_id) do update set grams = excluded.grams;
`;

fs.writeFileSync("supabase/migrations/20260905000007_seed_nutrition.sql", sql);
console.log(`ingredients: ${INGREDIENTS.length}, recipes: ${RECIPES.length}, links: ${RECIPES.reduce((n, r) => n + r[4].length, 0)}`);
