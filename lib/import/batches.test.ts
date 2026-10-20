import { describe, expect, it } from "vitest";
import { chunkPayloads, DEFAULT_DURATION_S, localToDate, minuteKey, sessionTimes, toPayloads } from "./batches";
import type { ImportedWorkout, WorkoutPayload } from "./types";

const set = { weightKg: 100, reps: 5, rpe: null, durationS: null, distanceM: null };

function workout(overrides: Partial<ImportedWorkout> = {}): ImportedWorkout {
  return {
    start: { date: "2024-03-07", time: "18:00" },
    timeStated: true,
    durationS: null,
    title: "Push",
    notes: null,
    exercises: [{ name: "Bench Press", sets: [set, set] }],
    ...overrides,
  };
}

describe("sessionTimes", () => {
  it("uses the file's duration when it has one", () => {
    const { startedAt, endedAt } = sessionTimes(workout({ durationS: 3900 }));
    expect(new Date(endedAt).getTime() - new Date(startedAt).getTime()).toBe(3900 * 1000);
  });

  it("records an hour when the file doesn't say, so every session has an end", () => {
    const { startedAt, endedAt } = sessionTimes(workout());
    expect(new Date(endedAt).getTime() - new Date(startedAt).getTime()).toBe(DEFAULT_DURATION_S * 1000);
  });

  it("ignores a duration no workout could have", () => {
    const { startedAt, endedAt } = sessionTimes(workout({ durationS: 3 * 86_400 }));
    expect(new Date(endedAt).getTime() - new Date(startedAt).getTime()).toBe(DEFAULT_DURATION_S * 1000);
  });

  it("reads the wall-clock time in this browser's zone", () => {
    const local = localToDate({ date: "2024-03-07", time: "18:05" });
    expect([local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes()])
      .toEqual([2024, 2, 7, 18, 5]);
  });
});

describe("minuteKey", () => {
  it("matches the same minute however it's written", () => {
    expect(minuteKey("2024-03-07T18:00:00+00:00")).toBe(minuteKey("2024-03-07T18:00:42.123Z"));
    expect(minuteKey("2024-03-07T18:00:00Z")).not.toBe(minuteKey("2024-03-07T18:01:00Z"));
  });
});

describe("toPayloads", () => {
  it("swaps names for library ids and drops what the lifter skipped", () => {
    const payloads = toPayloads(
      [
        workout({ exercises: [{ name: "Bench Press", sets: [set] }, { name: "Junk", sets: [set] }] }),
        workout({ start: { date: "2024-03-08", time: "18:00" }, exercises: [{ name: "Junk", sets: [set] }] }),
      ],
      (name) => (name === "Bench Press" ? "ex-1" : null),
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.exercises).toEqual([{ exerciseId: "ex-1", sets: [set] }]);
  });
});

describe("chunkPayloads", () => {
  const payload = (sets: number): WorkoutPayload => ({
    startedAt: "2024-03-07T18:00:00.000Z",
    endedAt: "2024-03-07T19:00:00.000Z",
    title: null,
    notes: null,
    exercises: [{ exerciseId: "ex-1", sets: Array.from({ length: sets }, () => set) }],
  });

  it("caps the workouts per batch", () => {
    const batches = chunkPayloads(Array.from({ length: 250 }, () => payload(10)));
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it("caps the sets per batch, so a heavy logger still fits the body limit", () => {
    const batches = chunkPayloads(Array.from({ length: 10 }, () => payload(40)), { maxSets: 100 });
    expect(batches.map((b) => b.length)).toEqual([2, 2, 2, 2, 2]);
  });

  it("always sends a workout, even one bigger than the cap on its own", () => {
    expect(chunkPayloads([payload(500)], { maxSets: 100 })).toHaveLength(1);
  });

  it("stays well under a megabyte of JSON at the default caps", () => {
    const batches = chunkPayloads(Array.from({ length: 300 }, () => payload(30)));
    for (const batch of batches) expect(JSON.stringify(batch).length).toBeLessThan(500_000);
  });
});
