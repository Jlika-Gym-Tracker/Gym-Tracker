/**
 * Week streaks and the sidebar's weight summary. Pure, so the shell and its
 * tests read the same rules.
 */

import { addDays, differenceInCalendarWeeks, parseISO, startOfWeek } from "date-fns";
import type { UnitSystem } from "@/lib/database.types";
import { remainingToGoal } from "@/lib/body/stats";
import { kgToDisplay, trimNumber, weightUnit } from "@/lib/units";
import type { WeekStartDay } from "@/lib/dates";

/**
 * Weeks in a row with at least one finished session, counting back from now.
 *
 * Weeks, not days: rest days are part of training, and a day streak that a
 * Sunday off resets punishes doing the program right. The current week counts
 * once it has a session; until then the streak still stands on last week, so
 * Monday morning does not read as a broken streak.
 */
export function weekStreak(
  sessionDates: string[],
  { today = new Date(), weekStartsOn = 1 as WeekStartDay } = {},
): number {
  if (sessionDates.length === 0) return 0;
  const thisWeek = startOfWeek(today, { weekStartsOn });
  const weeksAgo = new Set<number>();
  for (const iso of sessionDates) {
    const date = parseISO(iso);
    if (date > addDays(today, 1)) continue;
    weeksAgo.add(differenceInCalendarWeeks(thisWeek, date, { weekStartsOn }));
  }

  let n = weeksAgo.has(0) ? 0 : 1;
  if (!weeksAgo.has(n)) return 0;
  let streak = 0;
  while (weeksAgo.has(n)) {
    streak++;
    n++;
  }
  return streak;
}

export type ShellSummary = {
  eyebrow: string;
  value: string | null;
  caption: string;
  progress: number;
};

/**
 * The sidebar's little goal card: where you are, how far is left, and a bar
 * that fills from your first weigh-in to the goal weight.
 */
export function weightSummary({
  goalLabel,
  firstKg,
  currentKg,
  goalWeightKg,
  system,
}: {
  goalLabel: string;
  firstKg: number | null;
  currentKg: number | null;
  goalWeightKg: number | null;
  system: UnitSystem;
}): ShellSummary {
  const unit = weightUnit(system);
  if (currentKg == null) {
    return {
      eyebrow: goalLabel,
      value: null,
      caption: "Log your first weigh-in to start the trend.",
      progress: 0,
    };
  }
  const value = trimNumber(kgToDisplay(currentKg, system), 1);

  if (goalWeightKg == null) {
    const change = firstKg == null ? 0 : currentKg - firstKg;
    return {
      eyebrow: goalLabel,
      value,
      caption:
        Math.abs(change) < 0.05
          ? unit
          : `${unit} · ${change > 0 ? "+" : "−"}${trimNumber(kgToDisplay(Math.abs(change), system), 1)} so far`,
      // No goal weight to measure against, so the bar stays empty rather than guess.
      progress: 0,
    };
  }

  const left = remainingToGoal(currentKg, goalWeightKg);
  if (!left) {
    return { eyebrow: goalLabel, value, caption: `${unit} · goal reached`, progress: 1 };
  }
  const start = firstKg ?? currentKg;
  const total = Math.abs(goalWeightKg - start);
  const done = total > 0 ? 1 - Math.abs(goalWeightKg - currentKg) / total : 0;
  return {
    eyebrow: goalLabel,
    value,
    caption: `${unit} · ${trimNumber(kgToDisplay(left.kg, system), 1)} to ${left.to}`,
    progress: Math.min(1, Math.max(0, done)),
  };
}
