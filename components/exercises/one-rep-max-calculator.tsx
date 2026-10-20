"use client";

import { useState } from "react";
import type { UnitSystem } from "@/lib/database.types";
import { E1RM_REP_CAP, estimateOneRepMax } from "@/lib/training/e1rm";
import { trimNumber, weightUnit } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * "What would this set make my max?" — for a set you have not done yet, or one
 * from another app. Refuses past the rep cap, like every other estimate here.
 * Shared by the session's exercise drawer and the Exercises page.
 */
export function OneRepMaxCalculator({
  system,
  initial,
  className,
}: {
  system: UnitSystem;
  /** A set to start from, in display units — your best, so the number is there at once. */
  initial?: { weight: number; reps: number };
  className?: string;
}) {
  const [weight, setWeight] = useState(initial ? trimNumber(initial.weight, 1) : "");
  const [reps, setReps] = useState(initial ? String(initial.reps) : "");
  const unit = weightUnit(system);
  const w = Number(weight.replace(",", "."));
  const r = Math.round(Number(reps));
  const tooMany = r > E1RM_REP_CAP;
  // Display units in, display units out: Epley is linear in the load.
  const estimate = w > 0 && r > 0 ? estimateOneRepMax(w, r) : 0;

  const field =
    "w-full min-w-0 rounded-[10px] border border-line bg-surface px-3 py-2.5 font-mono text-base outline-none focus:border-line-hi sm:text-[13px]";

  return (
    <div className={cn("rounded-[14px] border border-line bg-surface p-4", className)}>
      <div className="eyebrow mb-3">1RM calculator</div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] text-fg-dim uppercase">{unit}</span>
          <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="100" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] text-fg-dim uppercase">Reps</span>
          <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="5" className={field} />
        </label>
      </div>
      <p className="mt-3 text-[12.5px] leading-[1.5] text-fg-muted">
        {tooMany
          ? `Past ${E1RM_REP_CAP} reps an estimate says more about endurance than strength — no guess.`
          : estimate > 0
            ? (
                <>
                  Estimated max{" "}
                  <span className="font-mono font-bold text-accent">
                    {trimNumber(estimate, 1)} {unit}
                  </span>
                  {" · "}
                  {[90, 80, 70]
                    .map((pct) => `${pct}% ${trimNumber((estimate * pct) / 100, 1)}`)
                    .join(" · ")}
                </>
              )
            : "Type a weight and the reps you got (or think you would)."}
      </p>
    </div>
  );
}
