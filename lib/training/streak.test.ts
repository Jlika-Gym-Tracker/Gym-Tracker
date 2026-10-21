import { describe, expect, it } from "vitest";
import { weekStreak, weightSummary } from "./streak";

// A Wednesday; weeks start Monday unless a test says otherwise.
const today = new Date("2026-10-21T12:00:00");

describe("weekStreak", () => {
  it("is zero with no sessions", () => {
    expect(weekStreak([], { today })).toBe(0);
  });

  it("counts consecutive weeks back from this one", () => {
    expect(weekStreak(["2026-10-20", "2026-10-14", "2026-10-06"], { today })).toBe(3);
  });

  it("does not break on a week that has not had its session yet", () => {
    // Nothing this week so far, but last week and the one before count.
    expect(weekStreak(["2026-10-15", "2026-10-07"], { today })).toBe(2);
  });

  it("breaks on a whole week missed", () => {
    expect(weekStreak(["2026-10-20", "2026-09-30"], { today })).toBe(1);
    expect(weekStreak(["2026-10-01"], { today })).toBe(0);
  });

  it("counts several sessions in one week once", () => {
    expect(weekStreak(["2026-10-19", "2026-10-20", "2026-10-21"], { today })).toBe(1);
  });

  it("follows the user's week start", () => {
    // Saturday-start weeks: Sat 17 – Fri 23 is this week, Sat 10 – Fri 16 last.
    expect(weekStreak(["2026-10-16", "2026-10-10"], { today, weekStartsOn: 6 })).toBe(1);
    expect(weekStreak(["2026-10-17", "2026-10-16"], { today, weekStartsOn: 6 })).toBe(2);
  });
});

describe("weightSummary", () => {
  const base = { goalLabel: "Cut", system: "metric" as const };

  it("asks for a weigh-in when there is none", () => {
    expect(weightSummary({ ...base, firstKg: null, currentKg: null, goalWeightKg: 80 })).toMatchObject({
      value: null,
      progress: 0,
    });
  });

  it("fills the bar from the first weigh-in to the goal", () => {
    const s = weightSummary({ ...base, firstKg: 90, currentKg: 85, goalWeightKg: 80 });
    expect(s).toMatchObject({ value: "85", caption: "kg · 5 to lose" });
    expect(s.progress).toBeCloseTo(0.5, 5);
  });

  it("says when the goal is reached", () => {
    expect(weightSummary({ ...base, firstKg: 90, currentKg: 80.1, goalWeightKg: 80 })).toMatchObject({
      caption: "kg · goal reached",
      progress: 1,
    });
  });

  it("shows the change so far without a goal weight", () => {
    expect(weightSummary({ ...base, firstKg: 90, currentKg: 87.5, goalWeightKg: null }).caption).toBe(
      "kg · −2.5 so far",
    );
  });
});
