import { describe, expect, it } from "vitest";
import { sessionRecords, type FinishedExercise, type PreviousBest } from "./records";

const lift = (weight: number, reps: number) => ({ weight_kg: weight, reps, duration_s: null });
const held = (seconds: number) => ({ weight_kg: null, reps: null, duration_s: seconds });

function bests(entries: Record<string, Partial<PreviousBest>>) {
  return new Map(
    Object.entries(entries).map(([id, b]) => [
      id,
      { bestSet: null, heaviestKg: 0, longestS: 0, ...b },
    ]),
  );
}

const bench: FinishedExercise = { id: "bench", name: "Bench", tracking: "reps", sets: [lift(100, 5), lift(100, 4)] };

describe("sessionRecords", () => {
  it("flags a better estimated max", () => {
    const [record] = sessionRecords([bench], bests({ bench: { bestSet: { weight_kg: 95, reps: 5 }, heaviestKg: 95 } }));
    expect(record).toMatchObject({ kind: "e1rm", exerciseId: "bench" });
    expect(record!.value).toBeCloseTo(116.67, 1);
  });

  it("stays quiet when the session did not beat the best", () => {
    expect(
      sessionRecords([bench], bests({ bench: { bestSet: { weight_kg: 110, reps: 5 } } })),
    ).toEqual([]);
  });

  it("sets a baseline, not a record, the first time", () => {
    expect(sessionRecords([bench], bests({}))).toEqual([]);
  });

  it("counts a heavier bar as the record when every set ran past the rep cap", () => {
    const calves: FinishedExercise = { id: "calf", name: "Calf raise", tracking: "reps", sets: [lift(80, 20)] };
    const [record] = sessionRecords([calves], bests({ calf: { bestSet: { weight_kg: 70, reps: 20 }, heaviestKg: 70 } }));
    expect(record).toMatchObject({ kind: "load", value: 80, previous: 70 });
  });

  it("flags a longer hold", () => {
    const plank: FinishedExercise = { id: "plank", name: "Plank", tracking: "time", sets: [held(60), held(75)] };
    const [record] = sessionRecords([plank], bests({ plank: { longestS: 70 } }));
    expect(record).toMatchObject({ kind: "hold", value: 75, previous: 70 });
  });

  it("never calls cardio a record", () => {
    const run: FinishedExercise = { id: "run", name: "Run", tracking: "cardio", sets: [held(1800)] };
    expect(sessionRecords([run], bests({ run: { longestS: 600 } }))).toEqual([]);
  });
});
