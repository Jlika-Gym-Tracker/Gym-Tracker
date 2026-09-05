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
