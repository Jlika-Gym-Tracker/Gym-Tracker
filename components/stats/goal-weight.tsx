import { remainingToGoal } from "@/lib/body/stats";
import type { UnitSystem } from "@/lib/database.types";
import { kgToDisplay, trimNumber, weightUnit } from "@/lib/units";
import { cn } from "@/lib/utils";

/** The goal weight as the weight charts label their dashed line, in display units. */
export function goalLineLabel(goalWeightKg: number, system: UnitSystem) {
  return `Goal ${trimNumber(kgToDisplay(goalWeightKg, system))} ${weightUnit(system)}`;
}

/**
 * "Goal 75 kg · 2.3 kg to go" under a weight chart. Hook-free, so the Today
 * page can render it on the server and Progress inside its client screen.
 */
export function GoalWeightNote({
  goalWeightKg,
  currentKg,
  system,
  className,
}: {
  goalWeightKg: number;
  /** The latest weigh-in, or null before the first one. */
  currentKg: number | null;
  system: UnitSystem;
  className?: string;
}) {
  const left = currentKg == null ? null : remainingToGoal(currentKg, goalWeightKg);
  return (
    <p className={cn("font-mono text-[10.5px] text-fg-soft uppercase", className)}>
      {goalLineLabel(goalWeightKg, system)}
      {currentKg == null ? null : left ? (
        <>
          {" · "}
          {trimNumber(kgToDisplay(left.kg, system))} {weightUnit(system)} to go
        </>
      ) : (
        <span className="text-accent"> · reached</span>
      )}
    </p>
  );
}
