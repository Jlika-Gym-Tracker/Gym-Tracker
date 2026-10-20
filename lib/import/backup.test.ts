import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { looksLikeJson, parseBackupJson, parseHistoryFile } from "./backup";
import { minuteKey, sessionTimes, toPayloads } from "./batches";
import { exerciseKey, type ParsedHistory } from "./types";

const FIXTURE = fs.readFileSync(new URL("./__fixtures__/jlika-backup.json", import.meta.url), "utf8");

const BENCH = "bbbbbbbb-0000-4000-8000-000000000001";
const PLANK = "b2b2b2b2-0000-4000-8000-000000000002";
const LANDMINE = "cccccccc-0000-4000-8000-000000000001";

function parse(text = FIXTURE): ParsedHistory {
  const result = parseBackupJson(text);
  if (!result.ok) throw new Error(result.error);
  return result.history;
}

describe("parseBackupJson", () => {
  it("reads the account's finished and open sessions, oldest first", () => {
    const h = parse();
    expect(h.format).toBe("jlika");
    expect(h.unitsStated).toBe(true);
    expect(h.workouts.map((w) => w.title)).toEqual(["Push", null]);
    expect(h.workouts.map((w) => w.exact?.startedAt)).toEqual([
      "2026-10-07T17:02:11.123Z",
      "2026-10-14T17:30:20.512Z",
    ]);
  });

  it("keeps the session's own instants, rating, notes and bodyweight", () => {
    const [push] = parse().workouts;
    expect(push).toMatchObject({
      durationS: 3900,
      notes: "Shoulder felt fine",
      rating: 2,
      bodyweightKg: 81.5,
      exact: { startedAt: "2026-10-07T17:02:11.123Z", endedAt: "2026-10-07T18:07:11.123Z" },
    });
  });

  it("gives a session still open in the backup an hour, like any import without a length", () => {
    const open = parse().workouts[1]!;
    expect(open.durationS).toBeNull();
    expect(new Date(open.exact!.endedAt).getTime() - new Date(open.exact!.startedAt).getTime()).toBe(3_600_000);
  });

  it("orders sets by set_index and movements by when they were first logged", () => {
    const [push] = parse().workouts;
    expect(push!.exercises.map((e) => e.key)).toEqual([`id:${BENCH}`, `id:${LANDMINE}`]);
    expect(push!.exercises[0]!.sets).toEqual([
      { weightKg: 97.5, reps: 5, rpe: null, durationS: null, distanceM: null },
      { weightKg: 100, reps: 5, rpe: 8.5, durationS: null, distanceM: null },
    ]);
  });

  it("leaves out unticked and empty sets, and says how many", () => {
    const h = parse();
    expect(h.setCount).toBe(5);
    expect(h.untickedSkipped).toBe(2);
    expect(h.emptySkipped).toBe(1);
    // "Nothing ticked" had only an unticked set, so there is nothing to restore.
    expect(h.workouts.some((w) => w.title === "Nothing ticked")).toBe(false);
  });

  it("skips what can't be used and words each problem", () => {
    const h = parse();
    expect(h.issueCount).toBe(3);
    expect(h.issues.map((i) => i.message)).toEqual([
      "Session 5 has no start time we could read — skipped.",
      "Set 5 has a rep count we can't use (9000) — imported without it.",
      "Set 10 belongs to a session that isn't in the file — skipped.",
    ]);
    // The weight of that set still stands; an RPE of 0 means "not rated".
    expect(h.workouts[0]!.exercises[1]!.sets).toEqual([
      { weightKg: 40, reps: 10, rpe: null, durationS: null, distanceM: null },
      { weightKg: 40, reps: null, rpe: null, durationS: null, distanceM: null },
    ]);
  });

  it("leaves out an athlete's sessions and weigh-ins that a coach's export picked up", () => {
    const h = parse();
    expect(h.workouts.some((w) => w.title === "An athlete's legs day")).toBe(false);
    expect(h.bodyWeights?.some((b) => b.weightKg === 70)).toBe(false);
    expect(h.ignored).toContain("1 session of athletes you coach");
  });

  it("files your own exercise by name and a library one by id", () => {
    const byKey = new Map(parse().exercises.map((e) => [e.key, e]));
    expect(byKey.get(`id:${LANDMINE}`)).toMatchObject({
      name: "Landmine Press",
      sets: 2,
      workouts: 1,
      ref: { kind: "own", name: "Landmine Press", primaryMuscle: "shoulders", equipment: "barbell", tracking: "reps" },
    });
    expect(byKey.get(`id:${BENCH}`)).toMatchObject({
      sets: 2,
      ref: { kind: "library", id: BENCH, slug: null },
    });
    expect(byKey.get(`id:${PLANK}`)).toMatchObject({
      sets: 1,
      hasDuration: true,
      hasReps: false,
      ref: { kind: "library", id: PLANK, slug: null },
    });
  });

  it("reads a library exercise's slug when the file describes it", () => {
    const doc = JSON.parse(FIXTURE);
    doc.exercises = [{ id: PLANK, owner_id: null, slug: "plank", name: "Plank" }];
    const plank = parse(JSON.stringify(doc)).exercises.find((e) => e.key === `id:${PLANK}`);
    expect(plank).toMatchObject({ name: "Plank", ref: { kind: "library", id: PLANK, slug: "plank" } });
  });

  it("reads one weight per day and notes the measurements it leaves behind", () => {
    const h = parse();
    expect(h.bodyWeights).toEqual([
      { date: "2026-10-01", weightKg: 82.1 },
      { date: "2026-10-07", weightKg: 81.5 },
    ]);
    expect(h.ignored).toEqual([
      "progress photos",
      "meal plans and groceries",
      "crew",
      "your program",
      "profile and settings",
      "body measurements other than weight",
      "1 session of athletes you coach",
    ]);
  });

  it("refuses JSON that isn't an export, and a file cut short", () => {
    expect(parseBackupJson('{"workouts": []}')).toMatchObject({ ok: false });
    expect(parseBackupJson(FIXTURE.slice(0, 400))).toMatchObject({
      ok: false,
      error: expect.stringContaining("cut short"),
    });
  });
});

describe("restoring a backup through the shared batches", () => {
  it("uses the backup's own instants, so a restored session matches its original to the minute", () => {
    const [push] = parse().workouts;
    expect(minuteKey(sessionTimes(push!).startedAt)).toBe(minuteKey("2026-10-07T17:02:59Z"));
  });

  it("resolves exercises by key and carries the rating and bodyweight", () => {
    const h = parse();
    const ids: Record<string, string> = { [`id:${BENCH}`]: "lib-bench", [`id:${LANDMINE}`]: "own-landmine" };
    const payloads = toPayloads(h.workouts, (_name, key) => ids[key] ?? null);
    // The plank was left unresolved, so the open session has nothing left to send.
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      startedAt: "2026-10-07T17:02:11.123Z",
      endedAt: "2026-10-07T18:07:11.123Z",
      title: "Push",
      rating: 2,
      bodyweightKg: 81.5,
    });
    expect(payloads[0]!.exercises.map((e) => e.exerciseId)).toEqual(["lib-bench", "own-landmine"]);
  });

  it("keys CSV exercises by name, as before", () => {
    expect(exerciseKey({ name: "Bench Press (Barbell)" })).toBe("bench press (barbell)");
    expect(exerciseKey({ name: "Bench", key: `id:${BENCH}` })).toBe(`id:${BENCH}`);
  });
});

describe("parseHistoryFile", () => {
  it("reads JSON as a backup and anything else as an app's CSV", () => {
    expect(looksLikeJson("﻿  {")).toBe(true);
    expect(looksLikeJson("Date,Exercise")).toBe(false);
    const backup = parseHistoryFile(FIXTURE, { assumeUnits: "metric" });
    expect(backup.ok && backup.history.format).toBe("jlika");
    const csv = parseHistoryFile(
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n2024-03-07 18:00:00,Push,Bench Press,1,100,5",
      { assumeUnits: "metric" },
    );
    expect(csv.ok && csv.history.format).toBe("strong");
  });
});
