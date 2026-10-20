import { describe, expect, it } from "vitest";
import {
  MUSCLES,
  MUSCLE_LABEL,
  muscleLoad,
  normaliseMuscle,
  peakLoad,
  untrainedMuscles,
} from "./muscle-load";

const bench = { primaryMuscle: "chest", secondaryMuscles: ["shoulders", "triceps"] };
const row = { primaryMuscle: "middle_back", secondaryMuscles: ["biceps", "lats"] };

describe("normaliseMuscle", () => {
  it("accepts the library's own names", () => {
    expect(normaliseMuscle("middle_back")).toBe("middle_back");
  });

  it("folds the legacy spelling with a space", () => {
    expect(normaliseMuscle("lower back")).toBe("lower_back");
    expect(normaliseMuscle(" Lower Back ")).toBe("lower_back");
    expect(normaliseMuscle("lower-back")).toBe("lower_back");
  });

  it("drops anything it cannot draw", () => {
    expect(normaliseMuscle("cardiovascular system")).toBeNull();
    expect(normaliseMuscle("")).toBeNull();
    expect(normaliseMuscle(null)).toBeNull();
  });
});

describe("muscleLoad", () => {
  it("counts a primary hit as one set and each secondary as half", () => {
    expect(muscleLoad([bench, bench, bench])).toEqual({
      chest: 3,
      shoulders: 1.5,
      triceps: 1.5,
    });
  });

  it("adds across exercises", () => {
    const load = muscleLoad([bench, row, { primaryMuscle: "biceps", secondaryMuscles: [] }]);
    expect(load.biceps).toBe(1.5);
    expect(load.middle_back).toBe(1);
    expect(load.lats).toBe(0.5);
  });

  it("normalises the legacy 'lower back' secondary", () => {
    const deadlift = { primaryMuscle: "hamstrings", secondaryMuscles: ["glutes", "lower back"] };
    expect(muscleLoad([deadlift])).toEqual({ hamstrings: 1, glutes: 0.5, lower_back: 0.5 });
  });

  it("does not double-count a muscle listed twice or as both roles", () => {
    const odd = { primaryMuscle: "chest", secondaryMuscles: ["chest", "triceps", "triceps"] };
    expect(muscleLoad([odd])).toEqual({ chest: 1, triceps: 0.5 });
  });

  it("ignores names it does not know", () => {
    expect(muscleLoad([{ primaryMuscle: "cardio", secondaryMuscles: ["chest"] }])).toEqual({
      chest: 0.5,
    });
  });

  it("copes with a missing secondary list", () => {
    expect(muscleLoad([{ primaryMuscle: "calves", secondaryMuscles: null }])).toEqual({ calves: 1 });
  });

  it("counts only hard sets when asked", () => {
    const sets = [
      { ...bench, rpe: 9 }, // RIR 1: hard
      { ...bench, rpe: 7 }, // RIR 3: hard, on the line
      { ...bench, rpe: 6 }, // RIR 4: not hard
      { ...bench, rpe: null }, // unrated: unknown, so out
    ];
    expect(muscleLoad(sets, { hardOnly: true })).toEqual({ chest: 2, shoulders: 1, triceps: 1 });
    expect(muscleLoad(sets).chest).toBe(4);
  });

  it("returns nothing for no sets", () => {
    expect(muscleLoad([])).toEqual({});
  });
});

describe("untrainedMuscles", () => {
  it("names every muscle with no work, head to toe", () => {
    const missing = untrainedMuscles(muscleLoad([bench]));
    expect(missing).not.toContain("chest");
    expect(missing).not.toContain("triceps");
    expect(missing[0]).toBe("neck");
    expect(missing[missing.length - 1]).toBe("calves");
    expect(missing).toHaveLength(MUSCLES.length - 3);
  });

  it("treats an explicit zero as untrained", () => {
    expect(untrainedMuscles({ chest: 0 })).toContain("chest");
  });

  it("names all seventeen when nothing was done", () => {
    expect(untrainedMuscles({})).toEqual([...MUSCLES]);
  });
});

describe("peakLoad", () => {
  it("finds the busiest muscle", () => {
    expect(peakLoad({ chest: 3, triceps: 1.5 })).toBe(3);
    expect(peakLoad({})).toBe(0);
  });
});

describe("MUSCLES", () => {
  it("lists each of the seventeen muscles once, with a label", () => {
    expect(new Set(MUSCLES).size).toBe(17);
    for (const muscle of MUSCLES) expect(MUSCLE_LABEL[muscle]).toBeTruthy();
  });
});
