/**
 * Crew league scoring.
 *
 * Two independent scores. Consistency rewards showing up. Transformation
 * rewards movement toward *your own* goal, expressed as a percentage, so a cut
 * and a bulk sit on the same board and a heavier person has no advantage.
 *
 * Nothing here reads the database — the caller supplies rows. That keeps the
 * rules testable and keeps the numbers reproducible.
 */

import { goalProgressPct, rollingAverage, type Goal, type Metric } from "@/lib/body/stats";
import { estimateOneRepMax } from "@/lib/training/e1rm";

export const POINTS_PER_SESSION = 120;
export const POINTS_PER_SET = 10;
/** Sessions above this in one week stop earning — consistency, not volume. */
export const SESSION_CAP_PER_WEEK = 5;

export const TRANSFORMATION_PER_PCT = 200;
export const POINTS_PER_WAIST_CM = 40;
export const STRENGTH_HELD_BONUS = 150;
/** A recomp that holds within this band counts as positive progress. */
export const RECOMP_BAND_PCT = 0.5;

export type SessionSummary = {
  /** 0-based week index within the season. */
  weekIndex: number;
  completedSets: number;
};

/**
 * 120 per completed session, capped at five a week, plus 10 per completed set.
 *
 * The set points are deliberately uncapped: they reward finishing the sessions
 * you did start rather than starting more of them.
 */
export function consistencyPoints(sessions: SessionSummary[]): number {
  const byWeek = new Map<number, SessionSummary[]>();
  for (const session of sessions) {
    const list = byWeek.get(session.weekIndex) ?? [];
    list.push(session);
    byWeek.set(session.weekIndex, list);
  }

  let points = 0;
  for (const list of byWeek.values()) {
    points += Math.min(list.length, SESSION_CAP_PER_WEEK) * POINTS_PER_SESSION;
    points += list.reduce((sum, s) => sum + s.completedSets, 0) * POINTS_PER_SET;
  }
  return points;
}

export type TransformationInput = {
  goal: Goal;
  /** Baseline captured when the member joined the season. */
  startWeightKg: number | null;
  startWaistCm: number | null;
  startE1rm: number | null;
  /** Every body measurement in the season so far. */
  metrics: Metric[];
  /** Best set per movement, for the strength-held bonus. */
  topSets: { exerciseId: string; weightKg: number; reps: number }[];
};

export type TransformationResult = {
  points: number;
  goalProgressPct: number;
  waistLostCm: number;
  strengthHeld: boolean;
  currentE1rmAvg: number | null;
};

/** Mean estimated 1RM of the three heaviest movements. */
export function topThreeE1rmAverage(
  topSets: { exerciseId: string; weightKg: number; reps: number }[],
): number | null {
  const bestByExercise = new Map<string, number>();
  for (const set of topSets) {
    const value = estimateOneRepMax(set.weightKg, set.reps);
    if (value <= 0) continue;
    bestByExercise.set(
      set.exerciseId,
      Math.max(bestByExercise.get(set.exerciseId) ?? 0, value),
    );
  }
  const top = [...bestByExercise.values()].sort((a, b) => b - a).slice(0, 3);
  if (top.length === 0) return null;
  return top.reduce((a, b) => a + b, 0) / top.length;
}

/**
 * Transformation points.
 *
 * Bodyweight and waist are read as 7-day averages, never as a single weigh-in —
 * water alone moves the scale by a kilo, and a league that rewarded that would
 * reward dehydration.
 */
export function transformationPoints(input: TransformationInput): TransformationResult {
  const currentWeight = rollingAverage(input.metrics, "weight_kg", 7);
  const currentWaist = rollingAverage(input.metrics, "waist_cm", 7);

  let progressPct = 0;
  if (input.startWeightKg && currentWeight) {
    progressPct = goalProgressPct(input.startWeightKg, currentWeight, input.goal);
  } else if (input.goal === "recomp") {
    // No weight data on a recomp is indistinguishable from holding steady.
    progressPct = RECOMP_BAND_PCT;
  }

  const waistLostCm =
    input.startWaistCm && currentWaist ? Math.max(0, input.startWaistCm - currentWaist) : 0;

  const currentE1rmAvg = topThreeE1rmAverage(input.topSets);
  const strengthHeld = Boolean(
    input.startE1rm && currentE1rmAvg && currentE1rmAvg >= input.startE1rm,
  );

  const points =
    progressPct * TRANSFORMATION_PER_PCT +
    waistLostCm * POINTS_PER_WAIST_CM +
    (strengthHeld ? STRENGTH_HELD_BONUS : 0);

  return {
    // Moving away from your goal should cost you, but never below zero — a bad
    // fortnight should not be unrecoverable.
    points: Math.max(0, Math.round(points)),
    goalProgressPct: Number(progressPct.toFixed(2)),
    waistLostCm: Number(waistLostCm.toFixed(1)),
    strengthHeld,
    currentE1rmAvg,
  };
}

export type Standing = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  consistencyPts: number;
  transformationPts: number;
  sessions: number;
  plannedSessions: number;
  goalProgressPct: number;
  /** Weekday indexes with a completed session this week. */
  weekDots: number[];
};

export type StandingsTab = "overall" | "consistency" | "transformation";

export function scoreFor(standing: Standing, tab: StandingsTab): number {
  if (tab === "consistency") return standing.consistencyPts;
  if (tab === "transformation") return standing.transformationPts;
  return standing.consistencyPts + standing.transformationPts;
}

/** Sorts standings for a tab. Ties break on the other score, then on name. */
export function rankStandings(standings: Standing[], tab: StandingsTab): Standing[] {
  return [...standings].sort((a, b) => {
    const diff = scoreFor(b, tab) - scoreFor(a, tab);
    if (diff !== 0) return diff;
    const otherDiff =
      scoreFor(b, "overall") - scoreFor(a, "overall");
    if (otherDiff !== 0) return otherDiff;
    return a.displayName.localeCompare(b.displayName);
  });
}

/** Points the next completed session is worth, before any set points. */
export function nextSessionValue(sessionsThisWeek: number): number {
  return sessionsThisWeek >= SESSION_CAP_PER_WEEK ? 0 : POINTS_PER_SESSION;
}

export type BadgeSlug =
  | "perfect_week" | "early_bird" | "iron_waist"
  | "volume_king" | "streak_30" | "photo_day";

export const BADGES: { slug: BadgeSlug; name: string; detail: string }[] = [
  { slug: "perfect_week", name: "Perfect week", detail: "Every planned session" },
  { slug: "early_bird", name: "Early bird", detail: "5 sessions before 7am" },
  { slug: "iron_waist", name: "Iron waist", detail: "-5 cm from baseline" },
  { slug: "volume_king", name: "Volume king", detail: "50,000 kg in a week" },
  { slug: "streak_30", name: "Streak 30", detail: "30 days without a gap" },
  { slug: "photo_day", name: "Photo day", detail: "12 weeks of photos" },
];

export type BadgeInput = {
  plannedSessionsThisWeek: number;
  completedSessionsThisWeek: number;
  earlyMorningSessions: number;
  waistLostCm: number;
  bestWeeklyVolumeKg: number;
  longestStreakDays: number;
  distinctPhotoWeeks: number;
};

/** Which badges an account has earned. Evaluated by the nightly job. */
export function earnedBadges(input: BadgeInput): BadgeSlug[] {
  const earned: BadgeSlug[] = [];
  if (
    input.plannedSessionsThisWeek > 0 &&
    input.completedSessionsThisWeek >= input.plannedSessionsThisWeek
  ) {
    earned.push("perfect_week");
  }
  if (input.earlyMorningSessions >= 5) earned.push("early_bird");
  if (input.waistLostCm >= 5) earned.push("iron_waist");
  if (input.bestWeeklyVolumeKg >= 50_000) earned.push("volume_king");
  if (input.longestStreakDays >= 30) earned.push("streak_30");
  if (input.distinctPhotoWeeks >= 12) earned.push("photo_day");
  return earned;
}

export type ChallengeMetric =
  | "sessions" | "sets" | "waist_pct" | "weight_pct" | "protein_days" | "streak";

/** Progress on a challenge as a 0–1 fraction, clamped. */
export function challengeProgress(current: number, target: number): number {
  if (!target) return 0;
  return Math.max(0, Math.min(1, current / target));
}
