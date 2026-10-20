/**
 * Effort over time: how hard sets were, how often they were rated, and how the
 * ratings spread across the scale. Pure functions, unit-tested.
 *
 * Everything is aggregated in RIR — the internal unit (lib/training/effort.ts)
 * — and converted to the user's scale only for display, so a history that
 * mixes RPE and RIR entries still reads as one series.
 */

import { parseISO, startOfWeek, subDays } from "date-fns";
import { toDateString, WEEK_STARTS_ON, type WeekStartDay } from "@/lib/dates";
import { isHardSet, MIN_RATED, rirOf, rirToRpe, type EffortScale } from "./effort";

/** A completed set: the day it was trained and its stored RPE, if rated. */
export type EffortSet = { date: string; rpe: number | null };

export type EffortWindow = "30d" | "90d" | "1y" | "all";

export const EFFORT_WINDOWS: readonly { key: EffortWindow; label: string; days: number | null }[] = [
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "all", label: "All", days: null },
];

/** First day inside a window that ends today (inclusive), or null for all of it. */
export function windowStart(window: EffortWindow, today: Date): string | null {
  const days = EFFORT_WINDOWS.find((w) => w.key === window)?.days ?? null;
  return days == null ? null : toDateString(subDays(today, days - 1));
}

/** A week needs this many rated sets before its average goes on the line. */
export const MIN_RATED_PER_WEEK = 2;

/** Whole steps of RIR: 0, 1, 2, 3, and everything easier as 4. */
export type EffortBucket = 0 | 1 | 2 | 3 | 4;

/** Easiest to hardest, the order the distribution bars read in. */
export const EFFORT_BUCKETS: readonly EffortBucket[] = [4, 3, 2, 1, 0];

/**
 * The whole step a rating falls in.
 *
 * Rounds up, so each bucket holds (n − 1, n] reps in reserve. That keeps the
 * bars in step with the hard-set share: RIR 3 and everything below it is hard,
 * and so are buckets 0–3, with nothing that is not hard landing in them.
 */
export function rirBucket(rir: number): EffortBucket {
  const step = Math.ceil(Math.max(0, rir));
  return (step >= 4 ? 4 : step) as EffortBucket;
}

export type EffortWeek = { weekStart: string; averageRir: number; rated: number };

export type EffortSummary = {
  /** Completed sets in the window, rated or not. */
  total: number;
  rated: number;
  /** Null below MIN_RATED rated sets: a few taps are not a finding. */
  averageRir: number | null;
  /** Share of rated sets that were hard, 0–1. Null below MIN_RATED. */
  hardShare: number | null;
  /** Oldest first; weeks with fewer than MIN_RATED_PER_WEEK ratings are left out. */
  weekly: EffortWeek[];
  /** Rated sets per whole step, easiest first. */
  distribution: { bucket: EffortBucket; count: number }[];
};

export function summariseEffort(
  sets: readonly EffortSet[],
  {
    since = null,
    weekStartsOn = WEEK_STARTS_ON,
  }: { since?: string | null; weekStartsOn?: WeekStartDay } = {},
): EffortSummary {
  let total = 0;
  let rated = 0;
  let rirSum = 0;
  let hard = 0;
  const counts: Record<EffortBucket, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const weeks = new Map<string, { sum: number; rated: number }>();

  for (const set of sets) {
    if (since && set.date < since) continue;
    total++;
    const rir = rirOf(set.rpe);
    if (rir == null) continue;

    rated++;
    rirSum += rir;
    if (isHardSet(set.rpe)) hard++;
    counts[rirBucket(rir)]++;

    const week = toDateString(startOfWeek(parseISO(set.date), { weekStartsOn }));
    const entry = weeks.get(week) ?? { sum: 0, rated: 0 };
    entry.sum += rir;
    entry.rated++;
    weeks.set(week, entry);
  }

  const enough = rated >= MIN_RATED;
  return {
    total,
    rated,
    averageRir: enough ? rirSum / rated : null,
    hardShare: enough ? hard / rated : null,
    weekly: [...weeks.entries()]
      .filter(([, w]) => w.rated >= MIN_RATED_PER_WEEK)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, w]) => ({ weekStart, averageRir: w.sum / w.rated, rated: w.rated })),
    distribution: EFFORT_BUCKETS.map((bucket) => ({ bucket, count: counts[bucket] })),
  };
}

/**
 * The scale to show effort in, or null when there is nothing rated to show.
 *
 * Someone who turned the effort column off still has whatever they rated
 * before; that history reads in RPE, the scale it was stored in.
 */
export function effortDisplayScale(
  scale: EffortScale,
  hasRated: boolean,
): Exclude<EffortScale, "off"> | null {
  if (!hasRated) return null;
  return scale === "off" ? "rpe" : scale;
}

/** An RIR value as the number this scale reads. */
export function fromRir(rir: number, scale: Exclude<EffortScale, "off">): number {
  return scale === "rir" ? rir : rirToRpe(rir);
}

/** "0" … "4+" in RIR; the same steps in RPE are "10" … "≤6". */
export function bucketLabel(bucket: EffortBucket, scale: Exclude<EffortScale, "off">): string {
  if (scale === "rir") return bucket === 4 ? "4+" : String(bucket);
  return bucket === 4 ? "≤6" : String(10 - bucket);
}
