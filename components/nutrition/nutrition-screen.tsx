"use client";

import { useActionState, useOptimistic, useState, } from "react";
import { format, parseISO } from "date-fns";
import { Check, ChevronDown, RefreshCw, Shuffle } from "lucide-react";
import {
  generateWeekPlan,
  swapMeal,
  toggleMealEaten,
  type ActionState,
} from "@/app/actions/nutrition";
import type { PlannableRecipe } from "@/lib/nutrition/plan";
import {
  SLOT_LABELS,
  orderedIngredients,
  portionLine,
  recipeMacros,
} from "@/lib/nutrition/plan";
import type { WeekPlan } from "@/lib/nutrition/queries";
import type { Targets } from "@/lib/nutrition/targets";
import { DAY_NAMES } from "@/lib/dates";
import { Card } from "@/components/kit/card";
import { cn } from "@/lib/utils";
import { CalorieRing, MacroTile } from "./calorie-ring";
import { FoodThumb, mealImage } from "./food-thumb";
import { MealDetail } from "./meal-detail";
import { GroceryList } from "./grocery-list";
import { AllergiesPanel } from "./allergies-panel";
import { ActionButton } from "@/components/kit/action-button";
import { useAction } from "@/lib/use-action";

export function NutritionScreen({
  plan,
  targets,
  trainingDays,
  today,
  weekStart,
  recipes,
  excludes,
}: {
  plan: WeekPlan | null;
  targets: Targets;
  trainingDays: number[];
  today: string;
  weekStart: string;
  recipes: PlannableRecipe[];
  excludes: { kind: string; value: string }[];
}) {
  const [genState, generate] = useActionState(generateWeekPlan, {} as ActionState);
  const { pending: busy, run } = useAction();
  const [swapping, setSwapping] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Servings echo locally while the write lands, so portions and macros move
  // together the moment you press the stepper.
  const [localServings, setLocalServings] = useState<Record<string, number>>({});

  const entries = plan?.entries ?? [];
  const [optimisticEntries, markEaten] = useOptimistic(
    entries,
    (state, { id, eaten }: { id: string; eaten: boolean }) =>
      state.map((e) => (e.id === id ? { ...e, eaten } : e)),
  );

  const todayEntries = optimisticEntries.filter((e) => e.planned_on === today);
  const todayIsTraining = trainingDays.includes((parseISO(today).getDay() + 6) % 7);
  const dayTarget = todayIsTraining ? targets.trainingDay : targets;

  const eaten = todayEntries
    .filter((e) => e.eaten && e.recipe)
    .reduce(
      (total, e) => {
        const m = recipeMacros(e.recipe!, Number(e.servings));
        return {
          kcal: total.kcal + m.kcal,
          proteinG: total.proteinG + m.proteinG,
          carbG: total.carbG + m.carbG,
          fatG: total.fatG + m.fatG,
        };
      },
      { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
    );

  return (
    <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_336px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="flex flex-wrap items-center gap-[26px] rounded-[18px] p-[22px]">
          <CalorieRing consumed={eaten.kcal} target={dayTarget.calories} />
          <div className="min-w-[280px] flex-1">
            <div className="font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
              Target · {todayIsTraining ? "training day" : "rest day"}
            </div>
            <div className="my-2 text-2xl font-extrabold tracking-[-0.03em]">
              {dayTarget.calories.toLocaleString()} kcal · {dayTarget.proteinG} g protein
            </div>
            <p className="max-w-[420px] text-[12.5px] leading-[1.5] text-fg-soft">
              Maintenance is about {targets.maintenance.toLocaleString()} kcal.
              {todayIsTraining
                ? " Training days carry the extra carbohydrate to fuel the session."
                : " Protein stays put on rest days to protect muscle."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <MacroTile name="Protein" consumed={eaten.proteinG} target={dayTarget.proteinG} color="var(--accent)" />
              <MacroTile name="Carbs" consumed={eaten.carbG} target={dayTarget.carbG} color="var(--accent-2)" />
              <MacroTile name="Fat" consumed={eaten.fatG} target={dayTarget.fatG} color="var(--warn)" />
            </div>
          </div>
        </Card>

        <Card className="rounded-[18px]">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-[15px] font-bold">Today&apos;s meals</h2>
            <form action={generate} className="ml-auto">
              <input type="hidden" name="weekStart" value={weekStart} />
              <ActionButton
                className="hit flex items-center gap-1.5 font-mono text-[11px] font-semibold text-accent hover:text-accent-hi"
              >
                <RefreshCw className="size-3" strokeWidth={2.5} />
                {plan ? "REPLAN WEEK" : "PLAN THIS WEEK"}
              </ActionButton>
            </form>
          </div>

          {genState.error ? (
            <p className="mb-3 rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
              {genState.error}
            </p>
          ) : null}

          {todayEntries.length === 0 ? (
            <p className="py-8 text-center text-[13px] leading-[1.55] text-fg-dim">
              Nothing planned for today. Plan the week and meals appear here with a
              shopping list to match.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {todayEntries.map((entry) => {
                const servings = localServings[entry.id] ?? Number(entry.servings);
                const macros = entry.recipe ? recipeMacros(entry.recipe, servings) : null;
                const isOpen = expanded === entry.id;
                const alternatives = recipes.filter(
                  (r) => r.slot_hint === entry.slot && r.id !== entry.recipe?.id,
                );
                const thumb = entry.recipe ? mealImage(entry.recipe) : null;

                return (
                  <div key={entry.id}>
                    <div
                      className={cn(
                        "flex items-center gap-3.5 rounded-[14px] border p-3",
                        entry.eaten ? "border-line-hi bg-done" : "border-line bg-surface-2",
                      )}
                    >
                      {thumb ? (
                        <FoodThumb
                          src={thumb.src}
                          category={thumb.category}
                          alt={entry.recipe?.name ?? ""}
                          size={56}
                          className="rounded-xl"
                        />
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "font-mono text-[10px] font-bold tracking-[0.1em] uppercase",
                              entry.eaten ? "text-accent" : "text-fg-dim",
                            )}
                          >
                            {SLOT_LABELS[entry.slot] ?? entry.slot}
                          </span>
                          {entry.recipe?.prep_minutes ? (
                            <span className="font-mono text-[10px] text-fg-dim">
                              {entry.recipe.prep_minutes} MIN
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {entry.recipe?.name ?? "Nothing planned"}
                        </div>
                        <div className="mt-1 truncate text-[11.5px] text-fg-soft">
                          {entry.recipe
                            ? orderedIngredients(entry.recipe.ingredients)
                                .slice(0, 3)
                                .map((row) => portionLine(row, servings))
                                .join(" · ")
                            : null}
                          {entry.recipe && entry.recipe.ingredients.length > 3
                            ? ` · +${entry.recipe.ingredients.length - 3} more`
                            : null}
                        </div>
                      </div>

                      {macros ? (
                        <div className="flex-none text-right">
                          <div className="font-mono text-[15px] font-extrabold">
                            {Math.round(macros.kcal)}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-fg-dim">
                            P{Math.round(macros.proteinG)} C{Math.round(macros.carbG)} F
                            {Math.round(macros.fatG)}
                          </div>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        disabled={!entry.recipe}
                        onClick={() => {
                          setExpanded(isOpen ? null : entry.id);
                          setSwapping(null);
                        }}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} the recipe for ${entry.recipe?.name ?? "this meal"}`}
                        className={cn(
                          "flex-none rounded-lg p-1.5 transition-colors disabled:opacity-30",
                          isOpen ? "text-accent" : "text-fg-dim hover:text-accent",
                        )}
                      >
                        <ChevronDown
                          className={cn("size-4 transition-transform", isOpen && "rotate-180")}
                          strokeWidth={2}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSwapping(swapping === entry.id ? null : entry.id);
                          setExpanded(null);
                        }}
                        aria-label={`Swap ${entry.recipe?.name ?? "this meal"}`}
                        className="flex-none rounded-lg p-1.5 text-fg-dim hover:text-accent"
                      >
                        <Shuffle className="size-4" strokeWidth={2} />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          run(async () => {
                            markEaten({ id: entry.id, eaten: !entry.eaten });
                            await toggleMealEaten(entry.id, !entry.eaten);
                          })
                        }
                        disabled={busy}
                        aria-pressed={entry.eaten}
                        aria-label={`Mark ${entry.recipe?.name ?? "meal"} as eaten`}
                        className={cn(
                          "flex size-[30px] flex-none items-center justify-center rounded-[9px] border transition-colors",
                          entry.eaten ? "border-accent bg-accent" : "border-stroke",
                        )}
                      >
                        {entry.eaten ? (
                          <Check className="size-3.5 text-[#0a0c0d]" strokeWidth={3} />
                        ) : null}
                      </button>
                    </div>

                    {isOpen && entry.recipe ? (
                      <MealDetail
                        entryId={entry.id}
                        recipe={entry.recipe}
                        servings={servings}
                        onServingsChange={(next) =>
                          setLocalServings((prev) => ({ ...prev, [entry.id]: next }))
                        }
                      />
                    ) : null}

                    {swapping === entry.id ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-[12px] border border-line bg-surface-2 p-2.5">
                        {alternatives.length === 0 ? (
                          <p className="px-1 py-1 text-xs text-fg-dim">
                            No other {SLOT_LABELS[entry.slot]?.toLowerCase()} recipes clear
                            your filters yet.
                          </p>
                        ) : (
                          alternatives.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  setSwapping(null);
                                  await swapMeal(entry.id, r.id);
                                })
                              }
                              className="flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 text-[12px] font-medium text-fg-2 hover:border-line-sel hover:bg-accent-soft hover:text-accent"
                            >
                              <FoodThumb
                                {...mealImage(r)}
                                alt=""
                                size={24}
                                className="rounded-full p-0.5"
                              />
                              {r.name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="rounded-[18px]">
          <div className="mb-3.5 flex items-center gap-3">
            <h2 className="text-[15px] font-bold">Week plan</h2>
            <span className="ml-auto font-mono text-[11px] text-fg-dim uppercase">
              Training days get +{targets.trainingDay.calories - targets.calories} kcal
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
            {Array.from({ length: 7 }, (_, dayIndex) => {
              const date = format(
                new Date(parseISO(weekStart).getTime() + dayIndex * 86400000),
                "yyyy-MM-dd",
              );
              const dayEntries = optimisticEntries.filter((e) => e.planned_on === date);
              const isTraining = trainingDays.includes(dayIndex);
              const kcal = dayEntries.reduce(
                (sum, e) => sum + (e.recipe ? recipeMacros(e.recipe, Number(e.servings)).kcal : 0),
                0,
              );
              const protein = dayEntries.reduce(
                (sum, e) => sum + (e.recipe ? recipeMacros(e.recipe, Number(e.servings)).proteinG : 0),
                0,
              );
              const isToday = date === today;

              return (
                <div
                  key={date}
                  className={cn(
                    "flex min-h-[96px] flex-col rounded-xl border p-2.5",
                    isToday ? "border-line-sel bg-accent-soft" : "border-line bg-surface-2",
                  )}
                >
                  <div
                    className={cn(
                      "font-mono text-[10px] font-bold tracking-[0.1em]",
                      isToday ? "text-accent" : "text-fg-dim",
                    )}
                  >
                    {DAY_NAMES[dayIndex]?.toUpperCase()}
                  </div>
                  <div className="mt-2 font-mono text-[15px] font-extrabold">
                    {kcal > 0 ? Math.round(kcal) : "—"}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-fg-dim">
                    {protein > 0 ? `${Math.round(protein)} G P` : ""}
                  </div>
                  <div
                    className={cn(
                      "mt-auto text-[10.5px] font-semibold",
                      isTraining ? "text-accent-2" : "text-fg-dim",
                    )}
                  >
                    {isTraining ? "TRAINING" : "REST"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <GroceryList
          groceries={plan?.groceries ?? []}
          weekStart={weekStart}
          mealCount={entries.length}
        />
        <AllergiesPanel excludes={excludes} />
      </div>
    </div>
  );
}
