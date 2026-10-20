import { describe, expect, it } from "vitest";
import { liftSeries, type LiftSet } from "./lift-progress";

const set = (
  sessionId: string,
  date: string,
  exerciseId: string,
  weightKg: number | null,
  reps: number | null,
  rpe: number | null = null,
): LiftSet => ({ sessionId, date, exerciseId, weightKg, reps, rpe });

const NAMES = new Map([
  ["bench", "Bench Press"],
  ["squat", "Back Squat"],
  ["curl", "Curl"],
]);

describe("liftSeries", () => {
  it("draws one point per session from its best set", () => {
    const [bench] = liftSeries(
      [
        set("s1", "2026-10-01", "bench", 80, 5, 8), // e1RM 93.3
        set("s1", "2026-10-01", "bench", 85, 5, 9), // e1RM 99.2 — best
        set("s1", "2026-10-01", "bench", 90, 1, 9.5), // 90
      ],
      NAMES,
    );
    expect(bench!.points).toHaveLength(1);
    expect(bench!.points[0]).toMatchObject({ weightKg: 85, reps: 5, rpe: 9 });
    expect(bench!.points[0]!.e1rmKg).toBeCloseTo(85 * (1 + 5 / 30), 10);
  });

  it("orders points oldest first", () => {
    const [bench] = liftSeries(
      [
        set("s2", "2026-10-08", "bench", 85, 5),
        set("s1", "2026-10-01", "bench", 80, 5),
      ],
      NAMES,
    );
    expect(bench!.points.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-08"]);
  });

  it("skips a session with nothing it can estimate from", () => {
    const [bench] = liftSeries(
      [
        set("s1", "2026-10-01", "bench", 80, 5),
        // A zero estimate means "no estimate", not a 0 kg max.
        set("s2", "2026-10-08", "bench", 0, 10),
        set("s2", "2026-10-08", "bench", null, null),
      ],
      NAMES,
    );
    expect(bench!.points.map((p) => p.sessionId)).toEqual(["s1"]);
    expect(bench!.sessions).toBe(2);
  });

  it("leaves out exercises with no estimable session at all", () => {
    const series = liftSeries([set("s1", "2026-10-01", "plank", null, null)], NAMES);
    expect(series).toEqual([]);
  });

  it("puts the most-trained exercise first", () => {
    const series = liftSeries(
      [
        set("s1", "2026-10-01", "curl", 20, 10),
        set("s1", "2026-10-01", "squat", 100, 5),
        set("s2", "2026-10-03", "squat", 100, 5),
        set("s3", "2026-10-05", "bench", 80, 5),
      ],
      NAMES,
    );
    expect(series.map((s) => s.exerciseId)).toEqual(["squat", "bench", "curl"]);
  });
});
