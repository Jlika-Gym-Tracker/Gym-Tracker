import { describe, expect, it } from "vitest";
import { parseProgramText } from "./parse";
import {
  AUTO_MATCH_THRESHOLD,
  findCandidates,
  matchExercises,
  scoreExercise,
  searchLibrary,
  type LibraryExercise,
} from "./match";
import { SEEDED_LIBRARY } from "./__fixtures__/library";
import { FULL_LIBRARY_SAMPLE } from "./__fixtures__/full-library-sample";

/** The curated rows plus the long-tail rows that compete hardest with them. */
const FULL_LIBRARY = [...SEEDED_LIBRARY, ...FULL_LIBRARY_SAMPLE];
const matchOne = (name: string, library: LibraryExercise[] = FULL_LIBRARY) =>
  matchExercises([{ name }], library)[0]!;

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

describe("with the whole free-exercise-db library present", () => {
  it("lands the user's own program on exactly the rows it found before", () => {
    const before = matchExercises(PROGRAM_NAMES.map((name) => ({ name })), SEEDED_LIBRARY);
    const after = matchExercises(PROGRAM_NAMES.map((name) => ({ name })), FULL_LIBRARY);
    expect(after.map((m) => m.matched?.name)).toEqual(before.map((m) => m.matched?.name));
    expect(after.every((m) => m.matched?.featured)).toBe(true);
  });

  it.each([
    ["Bench Press", "Barbell Bench Press - Medium Grip"],
    ["Squat", "Barbell Squat"],
    ["RDL", "Romanian Deadlift"],
    ["Lat Pulldown", "Wide-Grip Lat Pulldown"],
    ["Deadlift", "Barbell Deadlift"],
    ["Overhead Press", "Standing Military Press"],
    ["Pull Up", "Pullups"],
    ["Leg Curl", "Lying Leg Curls"],
    ["Lateral Raise", "Side Lateral Raise"],
    ["Hammer Curl", "Hammer Curls"],
    ["Hip Thrust", "Barbell Glute Bridge"],
    ["Front Squat", "Front Barbell Squat"],
    ["Dips", "Dips - Triceps Version"],
    ["Push Up", "Pushups"],
    ["Incline Bench Press", "Barbell Incline Bench Press - Medium Grip"],
    ["Upright Row", "Upright Barbell Row"],
  ])("still matches %s to the curated %s", (name, curated) => {
    expect(matchOne(name).matched?.name).toBe(curated);
  });

  it("gives a near-tie to the featured row, not the long tail", () => {
    // Each of these scores at least as well against a long-tail row as against
    // the curated one; alphabetical order alone would pick the long-tail row.
    for (const name of ["Lunges", "Shoulder Press", "Calf Raise"]) {
      const { matched, candidates } = matchOne(name);
      expect(matched?.featured, name).toBe(true);
      const best = candidates.find((c) => c.exercise === matched)!.score;
      expect(candidates.some((c) => !c.exercise.featured && c.score >= best), name).toBe(true);
    }
  });

  it("lets a specific name reach its specific movement", () => {
    expect(matchOne("Sumo Deadlift").matched?.name).toBe("Sumo Deadlift");
    expect(matchOne("Goblet Squat").matched?.name).toBe("Goblet Squat");
    expect(matchOne("Close Grip Bench Press").matched?.name).toBe("Close-Grip Barbell Bench Press");
  });

  it("asks rather than guesses when the long tail ties with itself", () => {
    const { matched, candidates } = matchOne("Shrug");
    expect(matched).toBeNull();
    expect(candidates.map((c) => c.exercise.name)).toEqual(
      expect.arrayContaining(["Barbell Shrug", "Cable Shrugs"]),
    );
  });

  it("prefers your own movement over a long-tail row of the same name", () => {
    const own: LibraryExercise = {
      ...FULL_LIBRARY_SAMPLE.find((e) => e.name === "Sit-Up")!,
      id: "00000000-0000-4000-a000-000000000000",
      slug: "u-12345678-sit-up",
      owner_id: "12345678-0000-4000-8000-000000000000",
    };
    expect(matchOne("Sit Up", [...FULL_LIBRARY, own]).matched?.id).toBe(own.id);
  });

  it("keeps the raw score, so the threshold means what it did", () => {
    const [top] = findCandidates("Shoulder Press", FULL_LIBRARY);
    expect(top!.exercise.featured).toBe(true);
    expect(top!.score).toBeCloseTo(0.8, 2);
  });
});

describe("searching the library as you type", () => {
  it("finds movements from a half-typed word, curated ones first", () => {
    const results = searchLibrary("benc", FULL_LIBRARY);
    expect(results.length).toBeGreaterThan(5);
    expect(results.every((e) => [e.name, ...e.aliases].some((n) => /bench/i.test(n)))).toBe(true);
    const firstTail = results.findIndex((e) => !e.featured);
    expect(firstTail).toBeGreaterThan(0);
    expect(results.slice(firstTail).some((e) => e.featured)).toBe(false);
  });

  it("puts an exact name first, wherever it lives", () => {
    expect(searchLibrary("goblet squat", FULL_LIBRARY)[0]!.name).toBe("Goblet Squat");
    expect(searchLibrary("squat", FULL_LIBRARY)[0]!.name).toBe("Barbell Squat");
  });

  it("folds shorthand and reads aliases", () => {
    const [first] = searchLibrary("db press", FULL_LIBRARY);
    expect(first!.featured).toBe(true);
    expect(first!.name).toMatch(/Dumbbell.*Press/);
    expect(searchLibrary("skull", FULL_LIBRARY)[0]!.name).toBe("Lying Triceps Press");
  });

  it("returns the library as given when nothing is typed, and respects the limit", () => {
    expect(searchLibrary("  ", FULL_LIBRARY)).toEqual(FULL_LIBRARY);
    expect(searchLibrary("curl", FULL_LIBRARY, 3)).toHaveLength(3);
  });
});
