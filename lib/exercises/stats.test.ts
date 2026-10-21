import { describe, expect, it } from "vitest";
import { exerciseStats, type ExerciseSet } from "./stats";

let index = 0;
function set(
  sessionId: string,
  day: string,
  values: Partial<Pick<ExerciseSet, "weightKg" | "reps" | "rpe" | "durationS" | "distanceM">>,
): ExerciseSet {
  return {
    sessionId,
    startedAt: `${day}T18:00:00Z`,
    date: day,
    sessionTitle: `Session ${sessionId}`,
    setIndex: index++,
    weightKg: null,
    reps: null,
    rpe: null,
    durationS: null,
    distanceM: null,
    ...values,
  };
}

describe("exerciseStats", () => {
  it("finds the best set by estimated max, not the heaviest bar", () => {
    const stats = exerciseStats([
      set("a", "2026-10-01", { weightKg: 100, reps: 1 }),
      set("a", "2026-10-01", { weightKg: 90, reps: 8 }),
    ]);
    expect(stats.bestSet).toEqual({ weightKg: 90, reps: 8 });
    expect(stats.e1rmKg).toBeCloseTo(114, 0);
    expect(stats.heaviestKg).toBe(100);
  });

  it("draws one point per session, oldest first", () => {
    const stats = exerciseStats([
      set("b", "2026-10-08", { weightKg: 105, reps: 5 }),
      set("a", "2026-10-01", { weightKg: 100, reps: 5 }),
      set("a", "2026-10-01", { weightKg: 80, reps: 10 }),
    ]);
    expect(stats.curve.map((p) => [p.date, p.weightKg])).toEqual([
      ["2026-10-01", 100],
      ["2026-10-08", 105],
    ]);
  });

  it("lists the latest sessions first, each with its sets in order", () => {
    const sets = [
      set("c", "2026-10-15", { reps: 10, weightKg: 20 }),
      set("c", "2026-10-15", { reps: 8, weightKg: 22.5 }),
      set("a", "2026-10-01", { reps: 10, weightKg: 20 }),
      set("b", "2026-10-08", { reps: 10, weightKg: 20 }),
    ];
    const stats = exerciseStats([...sets].reverse(), 2);
    expect(stats.sessions).toBe(3);
    expect(stats.sets).toBe(4);
    expect(stats.recent.map((s) => s.sessionId)).toEqual(["c", "b"]);
    expect(stats.recent[0]!.sets.map((s) => s.weightKg)).toEqual([20, 22.5]);
  });

  it("reads holds and cardio by time and distance, with no curve", () => {
    const stats = exerciseStats([
      set("a", "2026-10-01", { durationS: 45 }),
      set("a", "2026-10-01", { durationS: 60 }),
      set("b", "2026-10-02", { durationS: 1200, distanceM: 3200 }),
    ]);
    expect(stats.longestS).toBe(1200);
    expect(stats.farthestM).toBe(3200);
    expect(stats.bestSet).toBeNull();
    expect(stats.curve).toEqual([]);
  });

  it("is empty before anything is logged", () => {
    expect(exerciseStats([])).toMatchObject({ sessions: 0, sets: 0, bestSet: null, e1rmKg: 0, recent: [] });
  });
});
