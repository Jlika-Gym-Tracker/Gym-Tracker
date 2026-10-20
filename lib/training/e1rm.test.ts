import { describe, expect, it } from "vitest";
import { E1RM_REP_CAP, bestSet, estimateOneRepMax, totalVolume } from "./e1rm";

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

  it("refuses to guess past the rep cap", () => {
    expect(estimateOneRepMax(60, E1RM_REP_CAP)).toBeCloseTo(84, 5);
    expect(estimateOneRepMax(60, E1RM_REP_CAP + 1)).toBe(0);
    expect(estimateOneRepMax(40, 20)).toBe(0);
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

  it("ignores sets past the rep cap when any set qualifies", () => {
    // 40×20 would "estimate" 66.7; it is not allowed to beat a real 60×5 (70).
    expect(bestSet([set(40, 20), set(60, 5)])).toMatchObject({ weight_kg: 60 });
    expect(bestSet([set(60, 13), set(50, 10)])).toMatchObject({ weight_kg: 50 });
  });

  it("falls back to the heaviest load when nothing qualifies", () => {
    expect(bestSet([set(40, 20), set(45, 15), set(45, 18)])).toMatchObject({
      weight_kg: 45,
      reps: 18,
    });
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
