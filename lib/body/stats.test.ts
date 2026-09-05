import { describe, expect, it } from "vitest";
import {
  delta,
  earliest,
  goalProgressPct,
  indexToStart,
  latest,
  rollingAverage,
  type Metric,
} from "./stats";

const m = (measured_on: string, weight_kg: number | null, waist_cm: number | null = null): Metric => ({
  measured_on, weight_kg, waist_cm,
  chest_cm: null, arm_cm: null, thigh_cm: null, hip_cm: null, bodyfat_pct: null,
});

const SERIES = [
  m("2026-06-01", 82.1, 92),
  m("2026-06-08", 81.6, null),
  m("2026-08-24", 78.2, 86),
  m("2026-08-31", 77.3, 85.5),
];

describe("latest / earliest", () => {
  it("finds the newest and oldest readings regardless of input order", () => {
    expect(latest(SERIES, "weight_kg")).toEqual({ value: 77.3, on: "2026-08-31" });
    expect(earliest(SERIES, "weight_kg")).toEqual({ value: 82.1, on: "2026-06-01" });
  });

  it("skips rows where that field was not filled in", () => {
    expect(latest(SERIES, "waist_cm")).toEqual({ value: 85.5, on: "2026-08-31" });
    expect(earliest(SERIES, "waist_cm")).toEqual({ value: 92, on: "2026-06-01" });
  });

  it("returns null when a field was never recorded", () => {
    expect(latest(SERIES, "bodyfat_pct")).toBeNull();
  });
});

describe("delta", () => {
  it("measures newest minus oldest", () => {
    expect(delta(SERIES, "weight_kg")).toBeCloseTo(-4.8, 5);
    expect(delta(SERIES, "waist_cm")).toBeCloseTo(-6.5, 5);
  });

  it("refuses to report a delta from a single reading", () => {
    expect(delta([m("2026-06-01", 82.1)], "weight_kg")).toBeNull();
  });
});

describe("rollingAverage", () => {
  it("averages the readings inside the window", () => {
    const week = [
      m("2026-08-31", 77.3), m("2026-08-30", 77.7),
      m("2026-08-29", 77.5), m("2026-08-28", 77.9),
    ];
    expect(rollingAverage(week, "weight_kg", 7)).toBeCloseTo(77.6, 5);
  });

  it("ignores readings older than the window", () => {
    const mixed = [m("2026-08-31", 77.3), m("2026-06-01", 90)];
    expect(rollingAverage(mixed, "weight_kg", 7)).toBeCloseTo(77.3, 5);
  });

  it("falls back to the single newest reading rather than returning nothing", () => {
    expect(rollingAverage([m("2026-08-31", 77.3)], "weight_kg", 7)).toBe(77.3);
  });

  it("returns null when there is no data at all", () => {
    expect(rollingAverage([], "weight_kg")).toBeNull();
  });
});

describe("goalProgressPct", () => {
  it("rewards loss on a cut and gain on a bulk", () => {
    expect(goalProgressPct(80, 78, "cut")).toBeCloseTo(2.5, 5);
    expect(goalProgressPct(80, 82, "bulk")).toBeCloseTo(2.5, 5);
  });

  it("penalises moving the wrong way", () => {
    expect(goalProgressPct(80, 82, "cut")).toBeCloseTo(-2.5, 5);
  });

  it("credits a recomp for holding steady and penalises drift", () => {
    expect(goalProgressPct(80, 80.2, "recomp")).toBe(0.5);
    expect(goalProgressPct(80, 78, "recomp")).toBeCloseTo(-2.5, 5);
  });

  it("treats weight as neutral for strength and health goals", () => {
    expect(goalProgressPct(80, 70, "strength")).toBe(0);
    expect(goalProgressPct(80, 90, "health")).toBe(0);
  });

  it("does not divide by zero", () => {
    expect(goalProgressPct(0, 70, "cut")).toBe(0);
  });
});

describe("indexToStart", () => {
  it("indexes a series to 100 at its first point", () => {
    const indexed = indexToStart([50, 55, 60]);
    // Exact equality would fail on 55/50*100 === 110.00000000000001.
    expect(indexed[0]).toBeCloseTo(100, 10);
    expect(indexed[1]).toBeCloseTo(110, 10);
    expect(indexed[2]).toBeCloseTo(120, 10);
  });

  it("survives a series that starts at zero", () => {
    expect(indexToStart([0, 0])).toEqual([100, 100]);
  });
});
