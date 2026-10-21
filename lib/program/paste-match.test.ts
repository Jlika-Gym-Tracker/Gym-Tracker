import { describe, expect, it } from "vitest";
import { parseProgramText } from "./parse";
import { matchPasted } from "./paste-match";
import type { LibraryExercise } from "./match";

const row = (
  slug: string,
  name: string,
  tracking: "reps" | "time" | "cardio",
  aliases: string[] = [],
  featured = true,
): LibraryExercise => ({
  id: slug,
  slug,
  name,
  aliases,
  primary_muscle: "quadriceps",
  equipment: "machine",
  image_start_url: null,
  tracking,
  featured,
  owner_id: null,
});

const LIBRARY = [
  row("plank", "Plank", "time", ["Front Plank"]),
  row("walking-treadmill", "Walking, Treadmill", "cardio", ["Treadmill Walk", "Incline Walk", "Walking"]),
  row("bicycling-stationary", "Stationary Bike", "cardio", ["Bicycling, Stationary", "Exercise Bike", "Bike"]),
  row("standing-calf-raises", "Standing Calf Raises", "reps", ["Standing Calf Raise"]),
  row("walking-lunge", "Barbell Walking Lunge", "reps", ["Walking Lunge"]),
];

function names(text: string) {
  const { days } = parseProgramText(text);
  return matchPasted(days[0]!.exercises, LIBRARY).map((m) => m.matched?.slug ?? null);
}

describe("matchPasted", () => {
  it("lands a hold on the timed movement", () => {
    expect(names("Plank: 3 × 30–60 sec")).toEqual(["plank"]);
  });

  it("lands cardio lines on cardio machines, whatever the filler words", () => {
    expect(
      names("Cardio: 15 min incline treadmill walk\nCardio: 15 min brisk treadmill walk\nCardio: 10 min easy cycling"),
    ).toEqual(["walking-treadmill", "walking-treadmill", "bicycling-stationary"]);
  });

  it("never sends a cardio walk to a walking lunge", () => {
    const { days } = parseProgramText("Cardio: 20 min walking");
    const [outcome] = matchPasted(days[0]!.exercises, LIBRARY);
    expect(outcome!.candidates[0]!.exercise.tracking).toBe("cardio");
  });

  it("matches ordinary lines as before", () => {
    expect(names("Standing Calf Raise: 3 × 12–15")).toEqual(["standing-calf-raises"]);
  });
});
