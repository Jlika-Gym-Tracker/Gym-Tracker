"use client";

import { useOptimistic, useState } from "react";
import { Check, ClipboardCheck, Copy } from "lucide-react";
import { toggleGroceryItem } from "@/app/actions/nutrition";
import { CATEGORY_LABELS, formatQuantity } from "@/lib/nutrition/plan";
import type { WeekPlan } from "@/lib/nutrition/queries";
import { Card } from "@/components/kit/card";
import { weekRangeLabel } from "@/lib/dates";
import { FoodThumb } from "./food-thumb";
import { cn } from "@/lib/utils";
import { Saving } from "@/components/kit/skeleton";
import { useAction } from "@/lib/use-action";

export function GroceryList({
  groceries,
  weekStart,
  mealCount,
}: {
  groceries: WeekPlan["groceries"];
  weekStart: string;
  mealCount: number;
}) {
  const { pending: saving, run } = useAction();
  const [copied, setCopied] = useState(false);
  const [items, setChecked] = useOptimistic(
    groceries,
    (state, { id, checked }: { id: string; checked: boolean }) =>
      state.map((item) => (item.id === id ? { ...item, checked } : item)),
  );

  const byCategory = items.reduce<Record<string, typeof items>>((acc, item) => {
    (acc[item.ingredient.category] ??= []).push(item);
    return acc;
  }, {});

  const checkedCount = items.filter((i) => i.checked).length;

  function exportList() {
    const text = Object.entries(byCategory)
      .map(
        ([category, list]) =>
          `${(CATEGORY_LABELS[category] ?? category).toUpperCase()}\n` +
          list
            .map(
              (i) =>
                `${i.checked ? "[x]" : "[ ]"} ${i.ingredient.name} — ${formatQuantity({
                  ingredientId: i.ingredient.id,
                  slug: i.ingredient.slug,
                  name: i.ingredient.name,
                  category: i.ingredient.category,
                  unitHint: i.ingredient.unit_hint,
                  totalGrams: Number(i.total_grams),
                })}`,
            )
            .join("\n"),
      )
      .join("\n\n");

    void navigator.clipboard.writeText(`Grocery list · ${weekRangeLabel(weekStart)}\n\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="rounded-[18px]">
      <div className="mb-1.5 flex items-center gap-2">
        <h2 className="text-[15px] font-bold">Grocery list</h2>
        <Saving busy={saving} />
        <span className="ml-auto font-mono text-[10.5px] text-fg-dim uppercase">
          {weekRangeLabel(weekStart)}
        </span>
      </div>
      <p className="mb-3.5 text-xs text-fg-soft">
        Built from this week&apos;s {mealCount} meals · {checkedCount} of {items.length} in
        your basket
      </p>

      {items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-dim">
          Plan the week and the shopping list writes itself.
        </p>
      ) : (
        <>
          {Object.entries(byCategory).map(([category, list]) => (
            <div key={category} className="mb-3.5">
              <div className="eyebrow mb-2">{CATEGORY_LABELS[category] ?? category}</div>
              <div className="flex flex-col gap-1.5">
                {list.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      run(async () => {
                        setChecked({ id: item.id, checked: !item.checked });
                        await toggleGroceryItem(item.id, !item.checked);
                      })
                    }
                    className="flex items-center gap-2.5 rounded-[10px] border border-[#171b1d] bg-surface-2 px-2.5 py-2.5 text-left transition-colors hover:border-line-hi"
                  >
                    <span
                      className={cn(
                        "flex size-[17px] flex-none items-center justify-center rounded-[5px] border",
                        item.checked ? "border-accent bg-accent" : "border-stroke",
                      )}
                    >
                      {item.checked ? (
                        <Check className="size-3 text-[#0a0c0d]" strokeWidth={3} />
                      ) : null}
                    </span>
                    <FoodThumb
                      src={item.ingredient.image_url}
                      category={item.ingredient.category}
                      alt=""
                      size={28}
                      className={cn("rounded-lg", item.checked && "opacity-40")}
                    />
                    <span
                      className={cn(
                        "text-[12.5px] font-medium",
                        item.checked ? "text-fg-dim line-through" : "text-fg-2",
                      )}
                    >
                      {item.ingredient.name}
                    </span>
                    <span className="ml-auto font-mono text-[10.5px] text-fg-dim">
                      {formatQuantity({
                        ingredientId: item.ingredient.id,
                        slug: item.ingredient.slug,
                        name: item.ingredient.name,
                        category: item.ingredient.category,
                        unitHint: item.ingredient.unit_hint,
                        totalGrams: Number(item.total_grams),
                      })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={exportList}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-[11px] border border-stroke bg-ghost px-4 py-3 text-[12.5px] font-semibold text-fg-2 transition-colors hover:bg-hover"
          >
            {copied ? (
              <>
                <ClipboardCheck className="size-3.5" strokeWidth={2} />
                Copied to clipboard
              </>
            ) : (
              <>
                <Copy className="size-3.5" strokeWidth={2} />
                Export list
              </>
            )}
          </button>
        </>
      )}
    </Card>
  );
}
