import { describe, expect, it } from "vitest";
import {
  bestSet,
  estimateOneRepMax,
  progressionHint,
  totalVolume,
} from "./e1rm";

const set = (weight: number | null, reps: number | null, rpe: number | null = null) => ({
  weight_kg: weight,
  reps,
  rpe,
});

describe("estimateOneRepMax (Epley)", () => {
  it("returns the load itself for a single", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  it("applies weight × (1 + reps/30)", () => {
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.33, 2);
    expect(estimateOneRepMax(60, 5)).toBeCloseTo(70, 5);
  });

  it("refuses to invent a max from nothing", () => {
    expect(estimateOneRepMax(0, 10)).toBe(0);
    expect(estimateOneRepMax(100, 0)).toBe(0);
    expect(estimateOneRepMax(-20, 5)).toBe(0);
  });
});

describe("bestSet", () => {
  it("prefers the highest estimated max, not the heaviest bar", () => {
    // 60×10 → e1RM 80; 70×3 → e1RM 77. The lighter set wins.
    expect(bestSet([set(70, 3), set(60, 10)])).toMatchObject({ weight_kg: 60, reps: 10 });
  });

  it("ignores sets with nothing logged", () => {
    expect(bestSet([set(null, null), set(40, 8)])).toMatchObject({ weight_kg: 40 });
    expect(bestSet([set(null, null)])).toBeNull();
    expect(bestSet([])).toBeNull();
  });
});

describe("totalVolume", () => {
  it("sums weight × reps", () => {
    expect(totalVolume([set(40, 10), set(50, 8)])).toBe(800);
  });

  it("treats missing values as zero rather than NaN", () => {
    expect(totalVolume([set(null, 10), set(50, null)])).toBe(0);
  });
});

describe("progressionHint", () => {
  it("says something useful when there is no history", () => {
    const hint = progressionHint({ lastSets: [], repMin: 8, repMax: 12 });
    expect(hint.suggestedKg).toBeNull();
    expect(hint.headline).toMatch(/first time/i);
  });

  it("adds load when the ceiling was hit with reps in reserve", () => {
    const hint = progressionHint({
      lastSets: [set(32, 12, 8)],
      repMin: 8,
      repMax: 12,
    });
    expect(hint.suggestedKg).toBe(34.5);
    expect(hint.headline).toMatch(/Add 2\.5 kg/);
  });

  it("holds the load when the ceiling was hit at high RPE", () => {
    const hint = progressionHint({
      lastSets: [set(32, 12, 9.5)],
      repMin: 8,
      repMax: 12,
    });
    expect(hint.suggestedKg).toBe(32);
    expect(hint.headline).toMatch(/close to failure/i);
  });

  it("chases reps when the range was not cleared", () => {
    const hint = progressionHint({
      lastSets: [set(32, 9, 8)],
      repMin: 8,
      repMax: 12,
    });
    expect(hint.suggestedKg).toBe(32);
    expect(hint.headline).toMatch(/add reps until you reach 12/i);
  });

  it("without RPE, only adds load when the ceiling was beaten outright", () => {
    expect(
      progressionHint({ lastSets: [set(32, 12)], repMin: 8, repMax: 12 }).suggestedKg,
    ).toBe(32);
    expect(
      progressionHint({ lastSets: [set(32, 13)], repMin: 8, repMax: 12 }).suggestedKg,
    ).toBe(34.5);
  });

  it("copes with an open-ended prescription", () => {
    const hint = progressionHint({ lastSets: [set(20, 15, 7)], repMin: null, repMax: null });
    expect(hint.headline).toMatch(/top of your range/i);
  });

  it("respects a custom increment and unit", () => {
    const hint = progressionHint({
      lastSets: [set(100, 12, 7)],
      repMin: 8,
      repMax: 12,
      incrementKg: 5,
      unitLabel: "lb",
    });
    expect(hint.suggestedKg).toBe(105);
    expect(hint.headline).toContain("lb");
  });
});
