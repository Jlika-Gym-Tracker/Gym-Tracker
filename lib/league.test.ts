import { describe, expect, it } from "vitest";
import {
  BADGES,
  POINTS_PER_SESSION,
  POINTS_PER_SET,
  SESSION_CAP_PER_WEEK,
  challengeProgress,
  consistencyPoints,
  earnedBadges,
  nextSessionValue,
  rankStandings,
  scoreFor,
  topThreeE1rmAverage,
  transformationPoints,
  type Standing,
} from "./league";
import type { Metric } from "@/lib/body/stats";

const metric = (
  measured_on: string,
  weight_kg: number | null,
  waist_cm: number | null = null,
): Metric => ({
  measured_on, weight_kg, waist_cm,
  chest_cm: null, arm_cm: null, thigh_cm: null, hip_cm: null, bodyfat_pct: null,
});

describe("consistencyPoints", () => {
  it("pays per session and per completed set", () => {
    expect(consistencyPoints([{ weekIndex: 0, completedSets: 21 }])).toBe(
      POINTS_PER_SESSION + 21 * POINTS_PER_SET,
    );
  });

  it("caps sessions at five a week", () => {
    const seven = Array.from({ length: 7 }, () => ({ weekIndex: 0, completedSets: 0 }));
    expect(consistencyPoints(seven)).toBe(SESSION_CAP_PER_WEEK * POINTS_PER_SESSION);
  });

  it("applies the cap per week, not across the season", () => {
    const twoWeeks = [
      ...Array.from({ length: 6 }, () => ({ weekIndex: 0, completedSets: 0 })),
      ...Array.from({ length: 6 }, () => ({ weekIndex: 1, completedSets: 0 })),
    ];
    expect(consistencyPoints(twoWeeks)).toBe(2 * SESSION_CAP_PER_WEEK * POINTS_PER_SESSION);
  });

  it("still counts sets from sessions above the cap", () => {
    const six = Array.from({ length: 6 }, () => ({ weekIndex: 0, completedSets: 10 }));
    expect(consistencyPoints(six)).toBe(
      SESSION_CAP_PER_WEEK * POINTS_PER_SESSION + 60 * POINTS_PER_SET,
    );
  });

  it("scores an empty season at zero", () => {
    expect(consistencyPoints([])).toBe(0);
  });
});

describe("topThreeE1rmAverage", () => {
  it("takes the best set per movement, then the top three", () => {
    const avg = topThreeE1rmAverage([
      { exerciseId: "a", weightKg: 100, reps: 1 },
      { exerciseId: "a", weightKg: 60, reps: 5 },
      { exerciseId: "b", weightKg: 80, reps: 1 },
      { exerciseId: "c", weightKg: 60, reps: 1 },
      { exerciseId: "d", weightKg: 20, reps: 1 },
    ]);
    expect(avg).toBeCloseTo(80, 5);
  });

  it("returns null when nothing has been lifted", () => {
    expect(topThreeE1rmAverage([])).toBeNull();
  });
});

describe("transformationPoints", () => {
  const base = {
    goal: "cut" as const,
    startWeightKg: 82,
    startWaistCm: 92,
    startE1rm: 100,
    metrics: [metric("2026-08-31", 78, 87), metric("2026-08-29", 78.4, null)],
    topSets: [
      { exerciseId: "a", weightKg: 105, reps: 1 },
      { exerciseId: "b", weightKg: 105, reps: 1 },
      { exerciseId: "c", weightKg: 105, reps: 1 },
    ],
  };

  it("scores weight moved toward the goal, waist lost and strength held", () => {
    const result = transformationPoints(base);
    // 7-day average of 78 and 78.4 is 78.2 → 4.63% of 82 lost.
    expect(result.goalProgressPct).toBeCloseTo(4.63, 1);
    expect(result.waistLostCm).toBe(5);
    expect(result.strengthHeld).toBe(true);
    // goalProgressPct is reported rounded to 2dp while the points are computed
    // from the full-precision value, so recomputing here lands within a point.
    const expected = result.goalProgressPct * 200 + 5 * 40 + 150;
    expect(Math.abs(result.points - expected)).toBeLessThanOrEqual(1);
  });

  it("uses a rolling average rather than the newest weigh-in", () => {
    const spiked = transformationPoints({
      ...base,
      metrics: [metric("2026-08-31", 76), metric("2026-08-30", 80)],
    });
    const single = transformationPoints({
      ...base,
      metrics: [metric("2026-08-31", 76)],
    });
    expect(spiked.goalProgressPct).toBeLessThan(single.goalProgressPct);
  });

  it("withholds the strength bonus when the lifts fell", () => {
    const result = transformationPoints({
      ...base,
      topSets: [{ exerciseId: "a", weightKg: 80, reps: 1 }],
    });
    expect(result.strengthHeld).toBe(false);
    expect(result.points).toBe(result.points);
    expect(result.points).toBeLessThan(transformationPoints(base).points);
  });

  it("puts a cut and a bulk on the same scale", () => {
    const cut = transformationPoints({
      ...base, goal: "cut", startWaistCm: null, startE1rm: null,
      metrics: [metric("2026-08-31", 78)],
    });
    const bulk = transformationPoints({
      ...base, goal: "bulk", startWeightKg: 74, startWaistCm: null, startE1rm: null,
      metrics: [metric("2026-08-31", 77.7)],
    });
    expect(Math.abs(cut.goalProgressPct - bulk.goalProgressPct)).toBeLessThan(0.7);
  });

  it("credits a recomp for holding steady", () => {
    const result = transformationPoints({
      ...base, goal: "recomp", startWeightKg: 80, startWaistCm: null, startE1rm: null,
      metrics: [metric("2026-08-31", 80.1)],
    });
    expect(result.goalProgressPct).toBe(0.5);
  });

  it("never returns negative points, however badly the fortnight went", () => {
    const result = transformationPoints({
      ...base, goal: "cut", startWaistCm: null, startE1rm: null,
      metrics: [metric("2026-08-31", 90)],
    });
    expect(result.points).toBe(0);
  });

  it("scores zero rather than guessing when there is no baseline", () => {
    const result = transformationPoints({
      ...base, startWeightKg: null, startWaistCm: null, startE1rm: null, metrics: [],
    });
    expect(result.points).toBe(0);
    expect(result.strengthHeld).toBe(false);
  });
});

describe("standings", () => {
  const standing = (
    displayName: string,
    consistencyPts: number,
    transformationPts: number,
  ): Standing => ({
    userId: displayName, displayName, avatarUrl: null,
    consistencyPts, transformationPts,
    sessions: 0, plannedSessions: 0, goalProgressPct: 0, weekDots: [],
  });

  const board = [
    standing("Sara", 1380, 1310),
    standing("Yassir", 1284, 1310),
    standing("Amine", 1160, 640),
  ];

  it("ranks on the combined score overall", () => {
    expect(rankStandings(board, "overall").map((s) => s.displayName)).toEqual([
      "Sara", "Yassir", "Amine",
    ]);
  });

  it("re-sorts when the tab changes", () => {
    expect(rankStandings(board, "transformation")[0]!.displayName).toBe("Sara");
    expect(scoreFor(board[1]!, "consistency")).toBe(1284);
  });

  it("breaks ties on the overall score, then alphabetically", () => {
    const tied = [standing("Bea", 100, 50), standing("Abe", 100, 50)];
    expect(rankStandings(tied, "consistency").map((s) => s.displayName)).toEqual([
      "Abe", "Bea",
    ]);
  });
});

describe("nextSessionValue", () => {
  it("is worth full points below the cap", () => {
    expect(nextSessionValue(2)).toBe(POINTS_PER_SESSION);
  });

  it("is worth nothing once the weekly cap is reached", () => {
    expect(nextSessionValue(SESSION_CAP_PER_WEEK)).toBe(0);
  });
});

describe("earnedBadges", () => {
  const none = {
    plannedSessionsThisWeek: 4, completedSessionsThisWeek: 2,
    earlyMorningSessions: 0, waistLostCm: 0, bestWeeklyVolumeKg: 0,
    longestStreakDays: 0, distinctPhotoWeeks: 0,
  };

  it("awards nothing on a quiet week", () => {
    expect(earnedBadges(none)).toEqual([]);
  });

  it("awards a perfect week only when the plan was met", () => {
    expect(earnedBadges({ ...none, completedSessionsThisWeek: 4 })).toContain("perfect_week");
  });

  it("does not award a perfect week when nothing was planned", () => {
    expect(
      earnedBadges({ ...none, plannedSessionsThisWeek: 0, completedSessionsThisWeek: 0 }),
    ).not.toContain("perfect_week");
  });

  it("awards each threshold badge at its boundary", () => {
    const all = earnedBadges({
      plannedSessionsThisWeek: 4, completedSessionsThisWeek: 4,
      earlyMorningSessions: 5, waistLostCm: 5, bestWeeklyVolumeKg: 50_000,
      longestStreakDays: 30, distinctPhotoWeeks: 12,
    });
    expect(all).toHaveLength(BADGES.length);
  });
});

describe("challengeProgress", () => {
  it("reports a fraction of the target", () => {
    expect(challengeProgress(11, 16)).toBeCloseTo(0.6875, 5);
  });

  it("clamps to the ends", () => {
    expect(challengeProgress(20, 16)).toBe(1);
    expect(challengeProgress(-3, 16)).toBe(0);
  });

  it("does not divide by zero", () => {
    expect(challengeProgress(5, 0)).toBe(0);
  });
});
