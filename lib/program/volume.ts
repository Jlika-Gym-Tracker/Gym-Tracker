import type { DayWithExercises } from "./queries";

/**
 * Weekly sets per muscle group, for the load check panel.
 *
 * Counts direct (primary-muscle) sets only. Secondary involvement is real but
 * counting it double-credits every compound and makes the floor meaningless.
 */
export const MUSCLE_GROUPS = [
  { key: "chest", label: "Chest", muscles: ["chest"] },
  { key: "back", label: "Back", muscles: ["lats", "middle_back", "lower_back", "traps"] },
  { key: "shoulders", label: "Shoulders", muscles: ["shoulders"] },
  { key: "arms", label: "Arms", muscles: ["biceps", "triceps", "forearms"] },
  { key: "quads", label: "Quads", muscles: ["quadriceps"] },
  { key: "posterior", label: "Hams / glutes", muscles: ["hamstrings", "glutes"] },
  { key: "calves", label: "Calves", muscles: ["calves"] },
  { key: "core", label: "Core", muscles: ["abdominals"] },
] as const;

/** A rough weekly floor for maintaining a group while in a deficit. */
export const SET_FLOOR: Record<string, number> = {
  chest: 10, back: 10, shoulders: 10, arms: 8,
  quads: 10, posterior: 10, calves: 6, core: 6,
};

export type MuscleLoad = {
  key: string;
  label: string;
  sets: number;
  floor: number;
  /** 0–1 against the floor, clamped for the bar width. */
  ratio: number;
  status: "under" | "met" | "high";
};

export function weeklyLoad(days: DayWithExercises[]): MuscleLoad[] {
  const totals = new Map<string, number>();

  for (const day of days) {
    for (const item of day.exercises) {
      const group = MUSCLE_GROUPS.find((g) =>
        (g.muscles as readonly string[]).includes(item.exercise.primary_muscle),
      );
      if (!group) continue;
      totals.set(group.key, (totals.get(group.key) ?? 0) + item.target_sets);
    }
  }

  return MUSCLE_GROUPS.map((group) => {
    const sets = totals.get(group.key) ?? 0;
    const floor = SET_FLOOR[group.key] ?? 10;
    return {
      key: group.key,
      label: group.label,
      sets,
      floor,
      ratio: Math.min(sets / floor, 1),
      status: sets === 0 || sets < floor ? "under" : sets > floor * 2 ? "high" : "met",
    };
  });
}

/** The sentence under the load bars. Names the biggest gap, or confirms it's fine. */
export function loadAdvice(load: MuscleLoad[]): string {
  const withSets = load.filter((l) => l.sets > 0);
  if (withSets.length === 0) {
    return "Add exercises to see how the week's volume lands across muscle groups.";
  }
  const worst = load
    .filter((l) => l.status === "under")
    .sort((a, b) => a.sets - b.sets)[0];
  if (!worst) return "Every group clears its weekly floor. This week is balanced.";
  return worst.sets === 0
    ? `${worst.label} has no direct sets this week — below the ${worst.floor}-set floor for this block.`
    : `${worst.label} sits at ${worst.sets} sets — below the ${worst.floor}-set floor for this block.`;
}
