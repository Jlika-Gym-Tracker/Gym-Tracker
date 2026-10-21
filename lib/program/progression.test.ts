import { describe, expect, it } from "vitest";
import { progressWeek, summariseProgression, type PlannedExercise } from "./progression";
import type { LoggedSet, PastSession } from "./prescription";

const set = (weight: number | null, reps: number | null, rpe: number | null = null): LoggedSet => ({
  weight_kg: weight, reps, rpe,
});
const session = (...sets: LoggedSet[]): PastSession => ({ date: "2026-10-01", sets, target: null });

function planned(
  exerciseId: string,
  overrides: Partial<NonNullable<PlannedExercise["plan"]>> = {},
  extra: Partial<PlannedExercise> = {},
): PlannedExercise {
  return {
    key: exerciseId,
    exerciseId,
    exerciseName: exerciseId,
    tracking: "reps",
    primaryMuscle: "chest",
    equipment: "dumbbell",
    dayPolicy: "double",
    plan: {
      target_sets: 2,
      rep_min: 8,
      rep_max: 12,
      target_seconds: null,
      target_weight_kg: 32,
      progression: null,
      increment_kg: null,
      ...overrides,
    },
    ...extra,
  };
}

function run(exercises: PlannedExercise[], history: Record<string, PastSession[]>) {
  return progressWeek({ exercises, historyByExercise: new Map(Object.entries(history)) });
}

describe("progressWeek", () => {
  it("adds load once every set reached the top of the range", () => {
    const [outcome] = run([planned("press")], { press: [session(set(32, 12), set(32, 12))] });
    expect(outcome).toMatchObject({ previousKg: 32, nextKg: 34.5, status: "increase" });
    expect(outcome!.reason).toMatch(/add 2\.5 kg/);
  });

  it("holds when the range was cleared at failure", () => {
    const [outcome] = run([planned("press")], { press: [session(set(32, 12), set(32, 12, 10))] });
    expect(outcome).toMatchObject({ nextKg: 32, status: "hold" });
  });

  it("holds and chases reps when the range was not cleared", () => {
    const [outcome] = run([planned("press")], { press: [session(set(32, 12), set(32, 9))] });
    expect(outcome).toMatchObject({ nextKg: 32, status: "hold" });
    expect(outcome!.reason).toMatch(/aim for 10 reps/);
  });

  it("deloads after three sessions without progress", () => {
    const miss = session(set(40, 9), set(40, 8));
    const [outcome] = run([planned("press")], { press: [miss, miss, miss] });
    expect(outcome).toMatchObject({ status: "deload", nextKg: 35 });
  });

  it("carries the plan across untouched when nothing was ever logged", () => {
    const [outcome] = run([planned("press")], {});
    expect(outcome).toMatchObject({ previousKg: 32, nextKg: 32, status: "unlogged" });
  });

  it("says so when a movement has never been loaded at all", () => {
    const [outcome] = run([planned("press", { target_weight_kg: null })], {});
    expect(outcome).toMatchObject({ previousKg: null, nextKg: null, status: "first_time" });
    expect(outcome!.reason).toMatch(/pick a load/i);
  });

  it("compares against what was lifted, not what was planned", () => {
    // Planned 60, actually lifted 55 for the full range: step up from 55.
    const [outcome] = run([planned("press", { target_weight_kg: 60 })], {
      press: [session(set(55, 12), set(55, 12))],
    });
    expect(outcome!.previousKg).toBe(55);
    expect(outcome!.nextKg).toBe(57.5);
  });

  it("uses the exercise's own step when it sets one", () => {
    const [outcome] = run([planned("press", { increment_kg: 2 })], {
      press: [session(set(22, 12), set(22, 12))],
    });
    expect(outcome!.nextKg).toBe(24);
  });

  it("leaves the load alone when progression is off", () => {
    const [outcome] = run([planned("press", { progression: "off" })], {
      press: [session(set(32, 12), set(32, 12))],
    });
    expect(outcome).toMatchObject({ nextKg: 32, status: "off" });
  });

  it("moves a timed hold's target, not its load", () => {
    const [outcome] = run(
      [planned("plank", { rep_min: null, rep_max: null, target_seconds: 40, target_weight_kg: null }, { tracking: "time" })],
      {
        plank: [{ date: "2026-10-01", target: null, sets: [
          { weight_kg: null, reps: null, duration_s: 40 },
          { weight_kg: null, reps: null, duration_s: 41 },
        ] }],
      },
    );
    expect(outcome).toMatchObject({ status: "increase", nextSeconds: 45, nextKg: null });
  });
});

describe("summariseProgression", () => {
  it("counts each kind of outcome", () => {
    const miss = session(set(40, 9), set(40, 8));
    const outcomes = run(
      [planned("press"), planned("row"), planned("curl"), planned("fly")],
      {
        press: [session(set(32, 12), set(32, 12))],
        row: [session(set(60, 9), set(60, 9))],
        fly: [miss, miss, miss],
      },
    );
    expect(summariseProgression(outcomes)).toBe("1 going up · 1 holding · 1 deloading · 1 untouched");
  });

  it("is honest about an unlogged week", () => {
    expect(summariseProgression(run([planned("press")], {}))).toMatch(/nothing was logged/i);
  });

  it("copes with an empty week", () => {
    expect(summariseProgression([])).toBe("Nothing to carry forward.");
  });
});
