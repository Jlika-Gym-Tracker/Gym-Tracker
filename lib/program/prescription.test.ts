import { describe, expect, it } from "vitest";
import {
  defaultIncrementKg,
  nextPrescription,
  type LoggedSet,
  type PastSession,
  type PrescriptionInput,
  type SessionTarget,
} from "./prescription";

const set = (weight: number | null, reps: number | null, rpe: number | null = null): LoggedSet => ({
  weight_kg: weight,
  reps,
  rpe,
});
const hold = (seconds: number, weight: number | null = null): LoggedSet => ({
  weight_kg: weight,
  reps: null,
  duration_s: seconds,
});

const plan3x8to12: SessionTarget & { weightKg: number | null } = {
  sets: 3,
  repMin: 8,
  repMax: 12,
  seconds: null,
  weightKg: 60,
};
const plan3x5 = { ...plan3x8to12, repMin: 5, repMax: 5 };

const session = (sets: LoggedSet[], target: SessionTarget | null = null): PastSession => ({
  date: "2026-10-01",
  sets,
  target,
});

function run(overrides: Partial<PrescriptionInput>) {
  return nextPrescription({
    policy: "double",
    tracking: "reps",
    plan: plan3x8to12,
    history: [],
    incrementKg: 2.5,
    system: "metric",
    ...overrides,
  });
}

describe("first time", () => {
  it("uses the plan's load and says the session sets the baseline", () => {
    const p = run({});
    expect(p).toMatchObject({ kind: "first", weightKg: 60, reps: 12 });
    expect(p.why).toMatch(/baseline/);
  });
});

describe("double progression", () => {
  it("adds load once every set reaches the top of the range", () => {
    const p = run({ history: [session([set(60, 12), set(60, 12), set(60, 12)])] });
    expect(p).toMatchObject({ kind: "up", weightKg: 62.5, reps: 8 });
    expect(p.why).toMatch(/add 2\.5 kg/);
  });

  it("holds and asks for one more rep when the range was not cleared", () => {
    const p = run({ history: [session([set(60, 12), set(60, 10), set(60, 9)])] });
    expect(p).toMatchObject({ kind: "hold", weightKg: 60, reps: 10 });
  });

  it("counts a missing set as a miss", () => {
    const p = run({ history: [session([set(60, 12), set(60, 12)])] });
    expect(p.kind).toBe("hold");
  });

  it("holds when the range was cleared at failure", () => {
    const p = run({ history: [session([set(60, 12), set(60, 12), set(60, 12, 10)])] });
    expect(p).toMatchObject({ kind: "hold", weightKg: 60 });
    expect(p.why).toMatch(/RPE 10/);
  });

  it("deloads after three sessions without progress", () => {
    const miss = session([set(60, 9), set(60, 9), set(60, 8)]);
    const p = run({ history: [miss, miss, miss] });
    expect(p.kind).toBe("deload");
    expect(p.weightKg).toBe(55);
    expect(p.stalls).toBe(3);
  });

  it("stops counting stalls at the last good session", () => {
    const miss = session([set(60, 9), set(60, 9), set(60, 8)]);
    const good = session([set(57.5, 12), set(57.5, 12), set(57.5, 12)]);
    expect(run({ history: [miss, miss, good, miss] }).stalls).toBe(2);
  });

  it("judges a past session against the plan it followed", () => {
    // That week asked for 3 × 5; today's plan says 8–12. Five clean reps was a
    // success then, not a miss now.
    const then = session([set(80, 5), set(80, 5), set(80, 5)], {
      sets: 3, repMin: 5, repMax: 5, seconds: null,
    });
    expect(run({ history: [then] }).kind).toBe("up");
  });
});

describe("linear", () => {
  it("adds a step when every rep of every set was done", () => {
    const p = run({
      policy: "linear",
      plan: plan3x5,
      history: [session([set(100, 5), set(100, 5), set(100, 5)])],
      incrementKg: 5,
    });
    expect(p).toMatchObject({ kind: "up", weightKg: 105, reps: 5 });
  });

  it("holds after one miss and says how many are left before a deload", () => {
    const p = run({
      policy: "linear",
      plan: plan3x5,
      history: [session([set(100, 5), set(100, 4), set(100, 3)])],
    });
    expect(p).toMatchObject({ kind: "hold", weightKg: 100 });
    expect(p.why).toMatch(/2 more misses/);
  });

  it("deloads 10 % onto a loadable step after three misses", () => {
    const miss = session([set(100, 5), set(100, 4), set(100, 3)]);
    const p = run({ policy: "linear", plan: plan3x5, history: [miss, miss, miss] });
    expect(p).toMatchObject({ kind: "deload", weightKg: 90 });
  });

  it("never deloads to nothing on a light weight", () => {
    const miss = session([set(5, 5), set(5, 4), set(5, 3)]);
    const p = run({ policy: "linear", plan: plan3x5, history: [miss, miss, miss] });
    expect(p.weightKg).toBe(2.5);
  });
});

describe("Greyskull", () => {
  it("takes a double jump when the last set doubled the target", () => {
    const p = run({
      policy: "greyskull",
      plan: plan3x5,
      history: [session([set(60, 5), set(60, 5), set(60, 10)])],
    });
    expect(p).toMatchObject({ kind: "up", weightKg: 65 });
    expect(p.why).toMatch(/double jump/);
  });

  it("resets on the first miss", () => {
    const p = run({
      policy: "greyskull",
      plan: plan3x5,
      history: [session([set(60, 5), set(60, 5), set(60, 4)])],
    });
    expect(p).toMatchObject({ kind: "deload", weightKg: 55 });
  });
});

describe("bodyweight", () => {
  it("progresses in reps, not load", () => {
    const p = run({
      plan: { ...plan3x8to12, weightKg: null },
      history: [session([set(0, 12), set(0, 12), set(null, 12)])],
    });
    expect(p).toMatchObject({ kind: "up", weightKg: null, reps: 13 });
  });

  it("never suggests a deload in kilos", () => {
    const miss = session([set(null, 6), set(null, 5), set(null, 5)]);
    const p = run({ plan: { ...plan3x8to12, weightKg: null }, history: [miss, miss, miss] });
    expect(p.kind).toBe("hold");
    expect(p.weightKg).toBeNull();
  });
});

describe("timed holds", () => {
  const plank = { sets: 3, repMin: null, repMax: null, seconds: 45, weightKg: null };

  it("adds five seconds once every set was held in full", () => {
    const p = run({
      policy: "time",
      tracking: "time",
      plan: plank,
      history: [session([hold(45), hold(50), hold(45)])],
    });
    expect(p).toMatchObject({ kind: "up", seconds: 50 });
  });

  it("holds the target after a short set", () => {
    const p = run({
      policy: "time",
      tracking: "time",
      plan: plank,
      history: [session([hold(45), hold(40), hold(30)])],
    });
    expect(p).toMatchObject({ kind: "hold", seconds: 45 });
  });

  it("keeps a carried load alongside the time", () => {
    const p = run({
      policy: "time",
      tracking: "time",
      plan: plank,
      history: [session([hold(45, 32), hold(45, 32), hold(45, 32)])],
    });
    expect(p).toMatchObject({ kind: "up", weightKg: 32, seconds: 50 });
  });
});

describe("off and cardio", () => {
  it("leaves the plan's load alone when progression is off", () => {
    const p = run({ policy: "off", history: [session([set(60, 12), set(60, 12), set(60, 12)])] });
    expect(p).toMatchObject({ kind: "off", weightKg: 60 });
  });

  it("never progresses cardio", () => {
    const p = run({ tracking: "cardio", plan: { ...plan3x8to12, weightKg: null } });
    expect(p.kind).toBe("off");
  });
});

describe("imperial", () => {
  it("steps up by whole pounds", () => {
    const lb = 2.2046226218;
    const p = run({
      plan: { ...plan3x8to12, weightKg: 135 / lb },
      history: [session([set(135 / lb, 12), set(135 / lb, 12), set(135 / lb, 12)])],
      incrementKg: 5 / lb,
      system: "imperial",
    });
    expect(p.weightKg! * lb).toBeCloseTo(140, 5);
    expect(p.why).toContain("lb");
  });
});

describe("defaultIncrementKg", () => {
  it("gives big lower-body lifts the bigger step", () => {
    expect(defaultIncrementKg("quadriceps", "barbell", "metric")).toBe(5);
    expect(defaultIncrementKg("chest", "barbell", "metric")).toBe(2.5);
    expect(defaultIncrementKg("quadriceps", "dumbbell", "metric")).toBe(2.5);
  });
});
