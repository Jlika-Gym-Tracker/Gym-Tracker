import { describe, expect, it } from "vitest";
import { progressWeek, summariseProgression, type PlannedExercise } from "./progression";
import type { CompletedSet } from "@/lib/training/e1rm";

const set = (weight: number | null, reps: number | null, rpe: number | null = null): CompletedSet => ({
  weight_kg: weight, reps, rpe,
});

const press: PlannedExercise = {
  exerciseId: "press",
  exerciseName: "Incline Dumbbell Press",
  repMin: 8,
  repMax: 12,
  targetWeightKg: 32,
};

function run(exercises: PlannedExercise[], sets: Record<string, CompletedSet[]>) {
  return progressWeek({
    exercises,
    setsByExercise: new Map(Object.entries(sets)),
  });
}

describe("progressWeek", () => {
  it("adds load when the rep ceiling was cleared with reps in reserve", () => {
    const [outcome] = run([press], { press: [set(32, 12, 8)] });
    expect(outcome).toMatchObject({ previousKg: 32, nextKg: 34.5, status: "increase" });
    expect(outcome!.reason).toMatch(/Add 2\.5 kg/);
  });

  it("holds when the ceiling was hit but it was close to failure", () => {
    const [outcome] = run([press], { press: [set(32, 12, 9.5)] });
    expect(outcome).toMatchObject({ nextKg: 32, status: "hold" });
  });

  it("holds and chases reps when the range was not cleared", () => {
    const [outcome] = run([press], { press: [set(32, 9, 8)] });
    expect(outcome).toMatchObject({ nextKg: 32, status: "hold" });
    expect(outcome!.reason).toMatch(/add reps/i);
  });

  it("judges the best set, not the last one", () => {
    // A heavy top set then a lighter back-off should not read as a bad week.
    const [outcome] = run([press], { press: [set(32, 12, 8), set(24, 15, 6)] });
    expect(outcome!.status).toBe("increase");
  });

  it("carries the plan across untouched when nothing was logged", () => {
    const [outcome] = run([press], {});
    expect(outcome).toMatchObject({ previousKg: 32, nextKg: 32, status: "unlogged" });
    expect(outcome!.reason).toMatch(/not logged/i);
  });

  it("says so when a movement has never been loaded at all", () => {
    const [outcome] = run([{ ...press, targetWeightKg: null }], {});
    expect(outcome).toMatchObject({ previousKg: null, nextKg: null, status: "first_time" });
    expect(outcome!.reason).toMatch(/pick a load/i);
  });

  it("ignores rows with a weight but no reps", () => {
    const [outcome] = run([press], { press: [set(32, null)] });
    expect(outcome!.status).toBe("unlogged");
  });

  it("compares against what was lifted, not what was planned", () => {
    // Planned 60, actually lifted 55 for the full range with reps to spare:
    // next week should step up from 55, not from 60.
    const [outcome] = run([{ ...press, targetWeightKg: 60 }], { press: [set(55, 12, 7)] });
    expect(outcome!.previousKg).toBe(55);
    expect(outcome!.nextKg).toBe(57.5);
  });

  it("rounds to something you can actually load", () => {
    const [outcome] = progressWeek({
      exercises: [{ ...press, targetWeightKg: 33.3 }],
      setsByExercise: new Map([["press", [set(33.3, 12, 7)]]]),
      incrementKg: 2.27,
    });
    expect((outcome!.nextKg! * 4) % 1).toBe(0);
  });

  it("handles a whole week of mixed outcomes", () => {
    const outcomes = run(
      [
        press,
        { exerciseId: "row", exerciseName: "Row", repMin: 8, repMax: 12, targetWeightKg: 60 },
        { exerciseId: "curl", exerciseName: "Curl", repMin: 10, repMax: 15, targetWeightKg: 20 },
      ],
      {
        press: [set(32, 12, 8)],
        row: [set(60, 9, 9)],
      },
    );
    expect(outcomes.map((o) => o.status)).toEqual(["increase", "hold", "unlogged"]);
  });
});

describe("summariseProgression", () => {
  it("counts each kind of outcome", () => {
    const outcomes = run(
      [
        press,
        { exerciseId: "row", exerciseName: "Row", repMin: 8, repMax: 12, targetWeightKg: 60 },
        { exerciseId: "curl", exerciseName: "Curl", repMin: 10, repMax: 15, targetWeightKg: 20 },
      ],
      { press: [set(32, 12, 8)], row: [set(60, 9, 9)] },
    );
    expect(summariseProgression(outcomes)).toBe("1 going up · 1 holding · 1 untouched");
  });

  it("is honest about an unlogged week", () => {
    expect(summariseProgression(run([press], {}))).toMatch(/nothing was logged/i);
  });

  it("copes with an empty week", () => {
    expect(summariseProgression([])).toBe("Nothing to carry forward.");
  });
});
