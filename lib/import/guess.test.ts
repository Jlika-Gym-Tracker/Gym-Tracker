import { describe, expect, it } from "vitest";
import { guessEquipment, guessMuscle, guessTracking } from "./guess";

describe("guessMuscle", () => {
  it.each([
    ["Bench Press (Barbell)", "chest"],
    ["Close-Grip Bench Press", "triceps"],
    ["Lying Leg Curl (Machine)", "hamstrings"],
    ["Wrist Curl", "forearms"],
    ["Hammer Curl (Dumbbell)", "biceps"],
    ["Seated Cable Row", "middle_back"],
    ["Upright Row", "shoulders"],
    ["Lat Pulldown (Cable)", "lats"],
    ["Romanian Deadlift", "hamstrings"],
    ["Deadlift (Barbell)", "lower_back"],
    ["Hip Thrust", "glutes"],
    ["Bulgarian Split Squat", "quadriceps"],
    ["Hanging Knee Raise", "abdominals"],
    ["Running (Treadmill)", "quadriceps"],
    ["Farmer's Walk", "forearms"],
  ])("%s → %s", (name, muscle) => {
    expect(guessMuscle(name, null)).toBe(muscle);
  });

  it("falls back to the file's category when the name says nothing", () => {
    expect(guessMuscle("Zottman Thing", "Triceps")).toBe("triceps");
    expect(guessMuscle("Mystery Move", null)).toBe("chest");
  });

  it("lets the name overrule a vague category", () => {
    expect(guessMuscle("Leg Curl", "Legs")).toBe("hamstrings");
  });
});

describe("guessEquipment", () => {
  it.each([
    ["Bench Press (Barbell)", "barbell"],
    ["Incline DB Press", "dumbbell"],
    ["Lat Pulldown", "cable"],
    ["Bench Press (Smith Machine)", "machine"],
    ["EZ-Bar Curl", "ez_curl_bar"],
    ["Pull Up", "body_only"],
    ["Jump Rope", "other"],
    ["Rope Pushdown", "cable"],
    ["Sled Push", "machine"],
    ["Turkish Get-Up", "other"],
  ])("%s → %s", (name, equipment) => {
    expect(guessEquipment(name)).toBe(equipment);
  });
});

describe("guessTracking", () => {
  const base = { hasDistance: false, hasDuration: false, hasReps: true };

  it("reads cardio from any distance", () => {
    expect(guessTracking({ ...base, name: "Treadmill", hasDistance: true, hasReps: false })).toBe("cardio");
  });

  it("reads a timed hold from time without reps", () => {
    expect(guessTracking({ ...base, name: "Plank", hasDuration: true, hasReps: false })).toBe("time");
    expect(guessTracking({ ...base, name: "Farmer's Walk", hasDuration: true, hasReps: false })).toBe("time");
  });

  it("calls a timed run cardio even without a distance", () => {
    expect(guessTracking({ ...base, name: "Stationary Bike", hasDuration: true, hasReps: false })).toBe("cardio");
  });

  it("keeps anything with reps as weight × reps", () => {
    expect(guessTracking({ ...base, name: "Squat" })).toBe("reps");
  });
});
