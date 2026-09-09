"use client";

import { useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { setMealServings } from "@/app/actions/nutrition";
import {
  formatPortion,
  orderedIngredients,
  portionLine,
  type PlannableRecipe,
} from "@/lib/nutrition/plan";
import { macrosForGrams } from "@/lib/nutrition/targets";
import { cn } from "@/lib/utils";
import { FoodThumb } from "./food-thumb";

/**
 * What to cook and how much of it to eat.
 *
 * Portions scale with servings live, so the number you read is the number for
 * the plate you are actually making — a recipe that always states one serving
 * makes you do the arithmetic at the moment you are least inclined to.
 */
export function MealDetail({
  entryId,
  recipe,
  servings,
  onServingsChange,
}: {
  entryId: string;
  recipe: PlannableRecipe;
  servings: number;
  onServingsChange: (next: number) => void;
}) {
  const [pending, startTransition] = useTransition();
  const ingredients = orderedIngredients(recipe.ingredients);

  function adjust(delta: number) {
    const next = Math.min(4, Math.max(0.25, Math.round((servings + delta) * 4) / 4));
    if (next === servings) return;
    onServingsChange(next);
    startTransition(async () => {
      await setMealServings(entryId, next);
    });
  }

  function copyRecipe() {
    const lines = [
      recipe.name,
      servings === 1 ? "" : `${servings} servings`,
      "",
      ...ingredients.map((row) => `- ${portionLine(row, servings)}`),
      "",
      ...recipe.steps.map((step, i) => `${i + 1}. ${step}`),
    ].filter((line, i, all) => !(line === "" && all[i - 1] === ""));
    void navigator.clipboard.writeText(lines.join("\n"));
  }

  return (
    <div
      className={cn(
        "mt-1.5 rounded-[12px] border border-line bg-surface-2 p-3.5",
        pending && "opacity-70",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="eyebrow">
          What&apos;s in it · {recipe.ingredients.length} ingredients
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="eyebrow">Servings</span>
          <div className="flex items-center gap-1 rounded-[9px] border border-line bg-surface p-[3px]">
            <button
              type="button"
              onClick={() => adjust(-0.25)}
              disabled={servings <= 0.25}
              aria-label="Fewer servings"
              className="flex size-[22px] items-center justify-center rounded-md text-fg-dim transition-colors hover:bg-hover hover:text-fg disabled:opacity-30"
            >
              <Minus className="size-3" strokeWidth={2.5} />
            </button>
            <span className="w-9 text-center font-mono text-[12px] font-bold">
              {servings % 1 === 0 ? servings : servings.toFixed(2).replace(/0$/, "")}
            </span>
            <button
              type="button"
              onClick={() => adjust(0.25)}
              disabled={servings >= 4}
              aria-label="More servings"
              className="flex size-[22px] items-center justify-center rounded-md text-fg-dim transition-colors hover:bg-hover hover:text-fg disabled:opacity-30"
            >
              <Plus className="size-3" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {ingredients.map((row) => {
          const grams = row.grams * servings;
          const macros = macrosForGrams(row.ingredient, grams);
          return (
            <div
              key={row.ingredient.id}
              className="flex items-center gap-2.5 rounded-[9px] bg-surface px-2.5 py-2"
            >
              <FoodThumb
                src={row.ingredient.image_url}
                category={row.ingredient.category}
                alt=""
                size={26}
                className="rounded-lg"
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-2">
                {row.ingredient.name}
              </span>
              <span className="flex-none font-mono text-[12px] font-bold text-accent">
                {formatPortion(grams, row.ingredient.unit_hint, row.ingredient.slug)}
                {row.ingredient.unit_hint === "unit" ? "×" : ""}
              </span>
              <span className="w-[54px] flex-none text-right font-mono text-[10.5px] text-fg-dim">
                {Math.round(macros.kcal)} kcal
              </span>
            </div>
          );
        })}
      </div>

      {recipe.steps.length > 0 ? (
        <>
          <div className="eyebrow mt-4 mb-2.5">
            How to make it
            {recipe.prep_minutes ? ` · ${recipe.prep_minutes} min` : ""}
          </div>
          <ol className="flex flex-col gap-2">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="flex size-[22px] flex-none items-center justify-center rounded-md border border-line-hi bg-accent-soft font-mono text-[10px] font-bold text-accent">
                  {i + 1}
                </span>
                <span className="text-[12.5px] leading-[1.55] text-fg-muted">{step}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="mt-3 text-[12px] text-fg-dim">
          No method written for this one yet — the portions above are the whole story.
        </p>
      )}

      <button
        type="button"
        onClick={copyRecipe}
        className="mt-3.5 rounded-[9px] border border-stroke bg-ghost px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.06em] text-fg-soft uppercase transition-colors hover:bg-hover hover:text-fg"
      >
        Copy recipe
      </button>
    </div>
  );
}
