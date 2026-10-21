import { describe, expect, it } from "vitest";
import { planMerge, shareFileName, toSharedWeek, type SharedWeek } from "./share";
import { parseSharedWeek } from "./share-parse";
import type { DayWithExercises } from "./queries";

const day = (index: number, exercises: DayWithExercises["exercises"] = []): DayWithExercises => ({
  id: `d${index}`,
  day_index: index,
  name: index === 0 ? "Push" : "Rest",
  focus_note: null,
  is_rest: exercises.length === 0,
  progression: "linear",
  exercises,
});

const bench: DayWithExercises["exercises"][number] = {
  id: "row1",
  position: 0,
  target_sets: 5,
  rep_min: 5,
  rep_max: 5,
  per_side: false,
  note: "Pause the first rep",
  target_weight_kg: 100,
  target_seconds: null,
  superset_group: null,
  progression: null,
  increment_kg: null,
  exercise: {
    id: "x",
    name: "Barbell Bench Press",
    slug: "barbell-bench-press",
    primary_muscle: "chest",
    secondary_muscles: [],
    equipment: "barbell",
    image_start_url: null,
    tracking: "reps",
  },
};

describe("toSharedWeek", () => {
  it("carries the routine but never the planned load", () => {
    const shared = toSharedWeek("5×5", [day(0, [bench]), day(1)]);
    expect(shared.days[0]!.exercises[0]).toMatchObject({ slug: "barbell-bench-press", targetSets: 5, repMin: 5 });
    expect(JSON.stringify(shared)).not.toContain("100");
    expect(shared.days[0]!.progression).toBe("linear");
  });

  it("round-trips through the parser", () => {
    const shared = toSharedWeek("5×5", [day(0, [bench]), day(1)]);
    const parsed = parseSharedWeek(JSON.stringify(shared));
    expect(parsed).toEqual({ ok: true, week: shared });
  });
});

describe("parseSharedWeek", () => {
  it("explains what is wrong with a file that is not a week", () => {
    expect(parseSharedWeek("not json")).toMatchObject({ ok: false, error: expect.stringMatching(/JSON/) });
    expect(parseSharedWeek("{}")).toMatchObject({ ok: false, error: expect.stringMatching(/isn't a shared/) });
    expect(
      parseSharedWeek(JSON.stringify({ format: "jlika-week", version: 99, label: "x", days: [] })),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/newer version/) });
  });

  it("rejects a file that lists one day twice", () => {
    const shared = toSharedWeek("x", [day(0, [bench])]);
    shared.days.push({ ...shared.days[0]! });
    expect(parseSharedWeek(JSON.stringify(shared)).ok).toBe(false);
  });
});

describe("planMerge", () => {
  const incoming: SharedWeek = toSharedWeek("Theirs", [day(0, [bench]), day(1), day(2, [bench])]);

  it("never overwrites a day that already has a plan", () => {
    const plan = planMerge(incoming, [
      { day_index: 0, exerciseCount: 3 },
      { day_index: 1, exerciseCount: 0 },
      { day_index: 2, exerciseCount: 0 },
    ]);
    expect(plan.fill.map((d) => d.dayIndex)).toEqual([1, 2]);
    expect(plan.kept).toEqual([0]);
  });

  it("fills an empty week entirely", () => {
    expect(planMerge(incoming, []).fill).toHaveLength(3);
  });
});

describe("shareFileName", () => {
  it("is readable and dated", () => {
    expect(shareFileName("Upper / Lower 4-day", "2026-10-19")).toBe("upper-lower-4-day-2026-10-19.jlika-week.json");
  });
});
