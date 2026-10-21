import { describe, expect, it } from "vitest";
import { parseProgramText } from "./parse";

/** The four days exactly as they read in 4-Day-Upper-Lower-Program-Photos.pdf. */
const FULL_PROGRAM = `DAY 1 — UPPER A
1 Incline Dumbbell Press 3 x 8-12
2 Wide Grip Lat Pulldown 3 x 8-12
3 Machine Chest Press 3 x 10-12
4 Seated Cable Row 3 x 10-12
5 Dumbbell Lateral Raise 3 x 12-15
6 Cable Tricep Pushdown 3 x 10-15
7 EZ Bar Curl 3 x 10-15
FOCUS
Controlled reps, full range of motion and leaving 1-2 reps in reserve.

DAY 2 — LOWER A
1 Leg Press 3 x 8-12
2 Romanian Deadlift 3 x 8-10
3 Walking Lunges 3 x 10 each leg
4 Leg Extension 3 x 12-15
5 Hamstring Curl 3 x 10-15
6 Standing Calf Raise 4 x 12-15
7 Hanging Knee Raises 3 sets
FOCUS
Build strength without beating up your joints.

DAY 3 — UPPER B
1 Flat Dumbbell Press 3 x 8-12
2 Close Grip Lat Pulldown 3 x 8-12
3 Chest Supported Row 3 x 10-12
4 Machine Shoulder Press 3 x 8-12
5 Cable Lateral Raise 3 x 12-15
6 Overhead Cable Tricep Extension 3 x 10-15
7 Incline Dumbbell Curl 3 x 10-15
FOCUS
Different angles. Same muscle groups. More quality volume.

DAY 4 — LOWER B
1 Hack Squat 3 x 8-12
2 Bulgarian Split Squat 3 x 8 each leg
3 Seated Hamstring Curl 3 x 10-15
4 Leg Extension 3 x 12-15
5 Seated Calf Raise 4 x 12-15
6 Cable Crunch 3 sets
FOCUS
Train hard, recover well and come back stronger next week.`;

describe("parseProgramText — the real 4-day program", () => {
  const result = parseProgramText(FULL_PROGRAM);

  it("finds all four days in order, with no leftovers", () => {
    expect(result.days.map((d) => d.name)).toEqual([
      "UPPER A",
      "LOWER A",
      "UPPER B",
      "LOWER B",
    ]);
    expect(result.issues).toEqual([]);
  });

  it("honours the explicit DAY n numbering", () => {
    expect(result.days.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3]);
  });

  it("keeps every exercise, 27 slots across the week", () => {
    expect(result.days.map((d) => d.exercises.length)).toEqual([7, 7, 7, 6]);
    expect(result.days.flatMap((d) => d.exercises)).toHaveLength(27);
  });

  it("strips the leading index from the name", () => {
    expect(result.days[0]!.exercises[0]!.name).toBe("Incline Dumbbell Press");
    expect(result.days[0]!.exercises[6]!.name).toBe("EZ Bar Curl");
  });

  it("reads rep ranges", () => {
    const first = result.days[0]!.exercises[0]!;
    expect(first).toMatchObject({ targetSets: 3, repMin: 8, repMax: 12, perSide: false });
  });

  it("reads the 4-set calf raises", () => {
    expect(result.days[1]!.exercises[5]!).toMatchObject({
      name: "Standing Calf Raise",
      targetSets: 4,
      repMin: 12,
      repMax: 15,
    });
  });

  it("flags per-side work without leaving it in the name", () => {
    expect(result.days[1]!.exercises[2]!).toMatchObject({
      name: "Walking Lunges",
      targetSets: 3,
      repMin: 10,
      repMax: 10,
      perSide: true,
    });
    expect(result.days[3]!.exercises[1]!).toMatchObject({
      name: "Bulgarian Split Squat",
      targetSets: 3,
      repMin: 8,
      perSide: true,
    });
  });

  it("accepts a bare set count with no reps prescribed", () => {
    expect(result.days[1]!.exercises[6]!).toMatchObject({
      name: "Hanging Knee Raises",
      targetSets: 3,
      repMin: null,
      repMax: null,
    });
  });

  it("attaches each FOCUS block to the day above it", () => {
    expect(result.days[0]!.focusNote).toBe(
      "Controlled reps, full range of motion and leaving 1-2 reps in reserve.",
    );
    expect(result.days[3]!.focusNote).toBe(
      "Train hard, recover well and come back stronger next week.",
    );
  });

  it("does not mistake focus prose for an exercise", () => {
    const names = result.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(names.some((n) => n.toLowerCase().includes("controlled reps"))).toBe(false);
  });
});

describe("parseProgramText — formats people actually type", () => {
  it("handles separators, casing and spacing variants", () => {
    const r = parseProgramText(
      ["Day 1: Push", "Bench Press 4x6", "Overhead Press 3 × 8 - 12", "2) Dips 3 sets of 10"].join("\n"),
    );
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.exercises).toMatchObject([
      { name: "Bench Press", targetSets: 4, repMin: 6, repMax: 6 },
      { name: "Overhead Press", targetSets: 3, repMin: 8, repMax: 12 },
      { name: "Dips", targetSets: 3, repMin: 10, repMax: 10 },
    ]);
  });

  it("accepts bare day names without a DAY prefix", () => {
    const r = parseProgramText("UPPER A\nBench Press 3x10\n\nLOWER A\nSquat 3x5");
    expect(r.days.map((d) => d.name)).toEqual(["UPPER A", "LOWER A"]);
    expect(r.days.map((d) => d.dayIndex)).toEqual([0, 1]);
  });

  it("marks a rest day and keeps it rest when it has no exercises", () => {
    const r = parseProgramText("DAY 3 — REST\n\nDAY 4 — LOWER B\nHack Squat 3x10");
    expect(r.days[0]!.isRest).toBe(true);
    expect(r.days[1]!.isRest).toBe(false);
  });

  it("does not treat a PDF page footer as a day", () => {
    const r = parseProgramText("DAY 1 — UPPER A\nBench Press 3x10\n4-Day Upper/Lower · 2");
    expect(r.days).toHaveLength(1);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]!.reason).toBe("unreadable");
  });

  it("captures a trailing parenthetical as a note, not part of the name", () => {
    const r = parseProgramText("Day 1: Pull\nLat Pulldown 3x10 (slow eccentric)");
    expect(r.days[0]!.exercises[0]!).toMatchObject({
      name: "Lat Pulldown",
      note: "slow eccentric",
    });
  });

  it("puts orphan exercises into a day rather than dropping them", () => {
    const r = parseProgramText("Bench Press 3x10\nRow 3x10");
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.exercises).toHaveLength(2);
    expect(r.issues).toEqual([]);
  });

  it("returns nothing for empty input", () => {
    expect(parseProgramText("   \n\n ")).toMatchObject({ days: [], issues: [] });
  });
});

/** A real week, pasted as written: weekday headers, "×", en dashes, holds and cardio. */
const REAL_WEEK = `Monday - Upper A
Barbell Bench Press: 3 × 6–10
Neutral-Grip Lat Pulldown: 3 × 8–12
Incline Machine Press: 2 × 10–12
Single-Arm Dumbbell Row: 3 × 10 each
Reverse Pec Deck: 2 × 12–15
Rope Triceps Pushdown: 2 × 12–15
Hammer Curl: 2 × 10–15
Cardio: 15 min incline treadmill walk

Tuesday - Lower A
Smith Machine Squat: 3 × 8–10
Dumbbell Romanian Deadlift: 3 × 8–12
Reverse Lunge: 2 × 10 each
Seated Leg Curl: 3 × 10–15
Standing Calf Raise: 3 × 12–15
Plank: 3 × 30–60 sec
Cardio: 10 min easy cycling

Thursday - Upper B
Incline Smith Machine Press: 3 × 8–12
Assisted Pull-Up: 3 × 6–10
Wide-Grip Cable Row: 3 × 10–12
Seated Dumbbell Shoulder Press: 2 × 8–12
Cable Chest Fly: 2 × 12–15
Single-Arm Cable Triceps Extension: 2 × 10–15
Preacher Curl: 2 × 10–15
Cardio: 15 min brisk treadmill walk

Friday - Lower B
Hack Squat: 3 × 8–12
Hip Thrust: 3 × 8–12
Lying Leg Curl: 3 × 10–15
Step-Up: 2 × 10 each
Seated Calf Raise: 3 × 12–15
Reverse Crunch: 3 × 12–15
Cardio: 10 min easy cycling`;

describe("a week written with weekday headers", () => {
  const result = parseProgramText(REAL_WEEK);

  it("splits into the four named days, on their own weekdays", () => {
    expect(result.days.map((d) => [d.dayIndex, d.name])).toEqual([
      [0, "Upper A"],
      [1, "Lower A"],
      [3, "Upper B"],
      [4, "Lower B"],
    ]);
    expect(result.issues).toEqual([]);
    expect(result.days.map((d) => d.exercises.length)).toEqual([8, 7, 8, 7]);
  });

  it("reads ×, en dashes and a bare 'each'", () => {
    const [bench, , , row] = result.days[0]!.exercises;
    expect(bench).toMatchObject({ name: "Barbell Bench Press", kind: "reps", targetSets: 3, repMin: 6, repMax: 10 });
    expect(row).toMatchObject({ name: "Single-Arm Dumbbell Row", repMin: 10, repMax: 10, perSide: true });
  });

  it("reads a hold as time, starting from the bottom of its range", () => {
    const plank = result.days[1]!.exercises.find((e) => e.name === "Plank");
    expect(plank).toMatchObject({ kind: "time", targetSets: 3, targetSeconds: 30, repMin: null });
    expect(plank!.note).toMatch(/30s to 60s/);
  });

  it("reads cardio lines as one block of time, named by what follows", () => {
    const cardio = result.days[0]!.exercises.at(-1);
    expect(cardio).toMatchObject({
      kind: "cardio",
      name: "Incline treadmill walk",
      targetSets: 1,
      targetSeconds: 900,
    });
    expect(result.days[1]!.exercises.at(-1)).toMatchObject({ name: "Easy cycling", targetSeconds: 600 });
  });

  it("places weekdays relative to the week's own start", () => {
    // A week starting on a Saturday: Monday is its third day.
    const shifted = parseProgramText("Monday - Push\nBench Press: 3 x 8", { weekStartsOn: 6 });
    expect(shifted.days[0]!.dayIndex).toBe(2);
  });

  it("keeps two headers for one weekday from colliding", () => {
    const twice = parseProgramText("Monday\nBench Press: 3 x 8\nMonday\nSquat: 3 x 5");
    expect(twice.days.map((d) => d.dayIndex)).toEqual([0, 1]);
  });
});

describe("holds and cardio without a prefix", () => {
  it("reads a single cardio machine line", () => {
    const [ex] = parseProgramText("Treadmill: 20 min").days[0]!.exercises;
    expect(ex).toMatchObject({ kind: "cardio", name: "Treadmill", targetSeconds: 1200 });
  });

  it("reads holds in minutes and plain seconds", () => {
    const { days } = parseProgramText("Wall Sit: 3 x 1 min\nSide Plank 2 x 45s each");
    expect(days[0]!.exercises[0]).toMatchObject({ kind: "time", targetSeconds: 60, targetSets: 3 });
    expect(days[0]!.exercises[1]).toMatchObject({ kind: "time", targetSeconds: 45, perSide: true });
  });
});
