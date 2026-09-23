"use client";

import { useOptimistic, useState } from "react";
import { toggleExclude } from "@/app/actions/nutrition";
import { COMMON_ALLERGENS, COMMON_PREFERENCES } from "@/lib/nutrition/excludes";
import { Card } from "@/components/kit/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAction } from "@/lib/use-action";

type Exclude = { kind: string; value: string };

export function AllergiesPanel({ excludes }: { excludes: Exclude[] }) {
  const { pending: saving, run } = useAction();
  // The chip being written, so only it spins.
  const [busyChip, setBusyChip] = useState<string | null>(null);
  const [state, apply] = useOptimistic(
    excludes,
    (current, change: { kind: string; value: string; on: boolean }) =>
      change.on
        ? [...current, { kind: change.kind, value: change.value }]
        : current.filter((e) => !(e.kind === change.kind && e.value === change.value)),
  );

  const has = (kind: string, value: string) =>
    state.some((e) => e.kind === kind && e.value === value);

  function toggle(kind: "allergen" | "preference", value: string) {
    const on = !has(kind, value);
    setBusyChip(`${kind}:${value}`);
    run(async () => {
      apply({ kind, value, on });
      try {
        await toggleExclude(kind, value, on);
      } finally {
        setBusyChip(null);
      }
    });
  }

  return (
    <Card className="rounded-[18px]">
      <h2 className="text-[15px] font-bold">Allergies &amp; preferences</h2>
      <p className="mt-1 mb-3.5 text-xs leading-[1.5] text-fg-soft">
        Allergies are hard filters — a recipe containing one never appears in your
        plan, a swap or a search. Preferences only nudge.
      </p>

      <div className="eyebrow mb-2">Allergies</div>
      <div className="flex flex-wrap gap-2">
        {COMMON_ALLERGENS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => toggle("allergen", name)}
            disabled={saving}
            aria-busy={busyChip === `allergen:${name}` || undefined}
            aria-pressed={has("allergen", name)}
            className={cn(
              "hit rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
              has("allergen", name)
                ? "border-line-sel bg-accent-soft text-accent"
                : "border-line bg-surface-2 text-fg-soft hover:border-stroke",
            )}
          >
            {busyChip === `allergen:${name}` ? (
              <Loader2 className="mr-1 inline size-3 animate-spin align-[-1px]" strokeWidth={2.5} />
            ) : null}
            {name}
          </button>
        ))}
      </div>

      <div className="eyebrow mt-4 mb-2">Preferences</div>
      <div className="flex flex-wrap gap-2">
        {COMMON_PREFERENCES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => toggle("preference", name)}
            disabled={saving}
            aria-busy={busyChip === `preference:${name}` || undefined}
            aria-pressed={has("preference", name)}
            className={cn(
              "hit rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
              has("preference", name)
                ? "border-line-sel bg-accent-soft text-accent"
                : "border-line bg-surface-2 text-fg-soft hover:border-stroke",
            )}
          >
            {busyChip === `preference:${name}` ? (
              <Loader2 className="mr-1 inline size-3 animate-spin align-[-1px]" strokeWidth={2.5} />
            ) : null}
            {name}
          </button>
        ))}
      </div>
    </Card>
  );
}
