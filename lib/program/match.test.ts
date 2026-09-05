import { describe, expect, it } from "vitest";
import { parseProgramText } from "./parse";
import { AUTO_MATCH_THRESHOLD, findCandidates, matchExercises, scoreExercise } from "./match";
import { SEEDED_LIBRARY } from "./__fixtures__/library";

/** Every distinct movement name as it appears in the user's program PDF. */
const PROGRAM_NAMES = [
  "Incline Dumbbell Press", "Wide Grip Lat Pulldown", "Machine Chest Press",
  "Seated Cable Row", "Dumbbell Lateral Raise", "Cable Tricep Pushdown", "EZ Bar Curl",
  "Leg Press", "Romanian Deadlift", "Walking Lunges", "Leg Extension", "Hamstring Curl",
  "Standing Calf Raise", "Hanging Knee Raises", "Flat Dumbbell Press",
  "Close Grip Lat Pulldown", "Chest Supported Row", "Machine Shoulder Press",
  "Cable Lateral Raise", "Overhead Cable Tricep Extension", "Incline Dumbbell Curl",
  "Hack Squat", "Bulgarian Split Squat", "Seated Hamstring Curl", "Seated Calf Raise",
  "Cable Crunch",
];

describe("matching the user's own program against the seeded library", () => {
  it("auto-matches every movement, so a paste needs no review step", () => {
    const unmatched = matchExercises(
      PROGRAM_NAMES.map((name) => ({ name })),
      SEEDED_LIBRARY,
    )
      .filter((m) => !m.matched)
      .map((m) => `${m.parsed.name} → best ${m.candidates[0]?.exercise.name ?? "none"} (${m.candidates[0]?.score.toFixed(2) ?? "0"})`);

    expect(unmatched).toEqual([]);
  });

  it("routes the whole pasted week into real library rows", () => {
    const parsed = parseProgramText(
      ["DAY 1 — UPPER A", "1 Incline Dumbbell Press 3 x 8-12", "2 Wide Grip Lat Pulldown 3 x 8-12",
       "DAY 2 — LOWER A", "1 Leg Press 3 x 8-12", "2 Walking Lunges 3 x 10 each leg"].join("\n"),
    );
    const outcomes = matchExercises(parsed.days.flatMap((d) => d.exercises), SEEDED_LIBRARY);
    expect(outcomes.map((o) => o.matched?.name)).toEqual([
      "Incline Dumbbell Press",
      "Wide-Grip Lat Pulldown",
      "Leg Press",
      "Barbell Walking Lunge",
    ]);
  });
});

describe("scoring", () => {
  const byName = (n: string) => SEEDED_LIBRARY.find((e) => e.name === n)!;

  it("treats an exact name as a perfect match", () => {
    expect(scoreExercise("Leg Press", byName("Leg Press"))).toBe(1);
  });

  it("treats an alias as a perfect match too", () => {
    expect(scoreExercise("Hamstring Curl", byName("Lying Leg Curls"))).toBe(1);
    expect(scoreExercise("RDL", byName("Romanian Deadlift"))).toBe(1);
  });

  it("ignores punctuation and hyphenation differences", () => {
    expect(scoreExercise("wide grip lat pulldown", byName("Wide-Grip Lat Pulldown"))).toBe(1);
  });

  it("folds common shorthand into its long form", () => {
    expect(scoreExercise("Incline DB Press", byName("Incline Dumbbell Press"))).toBe(1);
  });

  it("scores an unrelated movement below the auto-match bar", () => {
    expect(scoreExercise("Leg Press", byName("Barbell Curl"))).toBeLessThan(AUTO_MATCH_THRESHOLD);
  });
});

describe("candidates for the review step", () => {
  it("offers ranked alternatives for something not in the library", () => {
    const candidates = findCandidates("Zercher Squat", SEEDED_LIBRARY);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.exercise.name).toMatch(/Squat/);
    expect(candidates[0]!.score).toBeLessThan(1);
  });

  it("leaves genuine nonsense unmatched rather than guessing", () => {
    const [outcome] = matchExercises([{ name: "Qwertyuiop Machine" }], SEEDED_LIBRARY);
    expect(outcome!.matched).toBeNull();
  });

  it("returns candidates sorted by score", () => {
    const scores = findCandidates("Lat Pulldown", SEEDED_LIBRARY).map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});
