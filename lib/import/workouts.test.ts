import { describe, expect, it } from "vitest";
import { parseHistoryCsv, type ParseOptions } from "./workouts";
import type { ParsedHistory } from "./types";

const metric: ParseOptions = { assumeUnits: "metric" };
const imperial: ParseOptions = { assumeUnits: "imperial" };

function parse(lines: string[], options = metric): ParsedHistory {
  const result = parseHistoryCsv(lines.join("\n"), options);
  if (!result.ok) throw new Error(result.error);
  return result.history;
}

const setsOf = (h: ParsedHistory) => h.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));

describe("Strong", () => {
  const CLASSIC = "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE";

  it("reads the classic export, one workout per start time", () => {
    const h = parse([
      CLASSIC,
      '2024-03-07 18:02:11,Push,1h 5m,Bench Press (Barbell),1,100,5,0,0,,"Good day, felt strong",8',
      "2024-03-07 18:02:11,Push,1h 5m,Bench Press (Barbell),2,100,5,0,0,,,",
      "2024-03-07 18:02:11,Push,1h 5m,Lateral Raise (Dumbbell),1,10,15,0,0,,,",
    ]);
    expect(h.format).toBe("strong");
    expect(h.workouts).toHaveLength(1);
    const [w] = h.workouts;
    expect(w!.start).toEqual({ date: "2024-03-07", time: "18:02" });
    expect(w!.durationS).toBe(3900);
    expect(w!.title).toBe("Push");
    expect(w!.notes).toBe("Good day, felt strong");
    expect(w!.exercises.map((e) => e.name)).toEqual(["Bench Press (Barbell)", "Lateral Raise (Dumbbell)"]);
    expect(w!.exercises[0]!.sets).toEqual([
      { weightKg: 100, reps: 5, rpe: 8, durationS: null, distanceM: null },
      { weightKg: 100, reps: 5, rpe: null, durationS: null, distanceM: null },
    ]);
  });

  it("asks about units when the classic export doesn't say, and converts when told lb", () => {
    const lines = [CLASSIC, "2024-03-07 18:02:11,Push,1h,Bench Press (Barbell),1,225,5,0,0,,,"];
    expect(parse(lines).unitsStated).toBe(false);
    expect(setsOf(parse(lines, imperial))[0]!.weightKg).toBe(102.06);
  });

  it("keeps two workouts on the same day apart", () => {
    const h = parse([
      CLASSIC,
      "2024-03-07 07:00:00,Cardio,30m,Running (Treadmill),1,0,0,5,1800,,,",
      "2024-03-07 18:00:00,Legs,1h,Squat (Barbell),1,140,5,0,0,,,",
    ]);
    expect(h.workouts.map((w) => w.title)).toEqual(["Cardio", "Legs"]);
    // A treadmill row writes 0 for weight and reps: those are absent, not zero.
    expect(h.workouts[0]!.exercises[0]!.sets[0]).toEqual({
      weightKg: null, reps: null, rpe: null, durationS: 1800, distanceM: 5000,
    });
  });

  it("skips sets marked W as warm-ups, and ignores rest-timer and note rows", () => {
    const h = parse([
      CLASSIC,
      "2024-03-07 18:00:00,Legs,1h,Squat (Barbell),W,60,5,0,0,,,",
      "2024-03-07 18:00:00,Legs,1h,Squat (Barbell),1,140,5,0,0,,,",
      "2024-03-07 18:00:00,Legs,1h,Squat (Barbell),D,100,8,0,0,,,",
      "2024-03-07 18:00:00,Legs,1h,Squat (Barbell),Rest Timer,0,0,0,180,,,",
      "2024-03-07 18:00:00,Legs,1h,Squat (Barbell),Note,0,0,0,0,brace harder,,",
    ]);
    expect(h.warmupsSkipped).toBe(1);
    expect(setsOf(h).map((s) => s.weightKg)).toEqual([140, 100]);
    expect(h.issueCount).toBe(0);
  });

  it("reads the 2024 semicolon export with units in the headers", () => {
    const h = parse([
      '"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"',
      '"1";"2025-04-29 12:00:00";"Chest and Triceps";"3600";"Bench Press (Barbell)";"1";"100.0";"10";"";"";"";"";""',
      '"2";"2025-04-30 07:00:00";"Run";"1500";"Running";"1";"";"";"";"5000";"1500";"";""',
    ]);
    expect(h.format).toBe("strong");
    expect(h.unitsStated).toBe(true);
    expect(h.workouts[0]!.durationS).toBe(3600);
    expect(setsOf(h)).toEqual([
      { weightKg: 100, reps: 10, rpe: null, durationS: null, distanceM: null },
      { weightKg: null, reps: null, rpe: null, durationS: 1500, distanceM: 5000 },
    ]);
  });

  it("reads the older export with a unit on every row", () => {
    const h = parse([
      "Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Workout Duration",
      "2019-05-01 17:30:00;Pull;Deadlift (Barbell);1;315;lbs;3;;;;0;;;1h 10m",
      "2019-05-01 17:30:00;Pull;Rowing (Machine);1;;;;;2;km;600;;;1h 10m",
    ]);
    expect(h.unitsStated).toBe(true);
    expect(h.workouts[0]!.durationS).toBe(4200);
    expect(setsOf(h)[0]!.weightKg).toBe(142.88);
    expect(setsOf(h)[1]!.distanceM).toBe(2000);
  });
});

describe("Hevy", () => {
  const HEADER = "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe";

  it("reads sets, durations from start and end, and skips warm-ups", () => {
    const h = parse([
      HEADER,
      'Upper,"12 Jan 2026, 18:00","12 Jan 2026, 19:15",,Bench Press (Barbell),,,0,warmup,40,10,,,',
      'Upper,"12 Jan 2026, 18:00","12 Jan 2026, 19:15",,Bench Press (Barbell),,,1,normal,80,8,,,8.5',
      'Upper,"12 Jan 2026, 18:00","12 Jan 2026, 19:15",,Bench Press (Barbell),,,2,failure,80,6,,,10',
      'Upper,"12 Jan 2026, 18:00","12 Jan 2026, 19:15",,Plank,,,0,normal,,,,60,',
    ]);
    expect(h.format).toBe("hevy");
    expect(h.warmupsSkipped).toBe(1);
    const [w] = h.workouts;
    expect(w!.durationS).toBe(75 * 60);
    expect(w!.exercises[0]!.sets.map((s) => [s.weightKg, s.reps, s.rpe])).toEqual([[80, 8, 8.5], [80, 6, 10]]);
    expect(w!.exercises[1]!.sets[0]).toEqual({ weightKg: null, reps: null, rpe: null, durationS: 60, distanceM: null });
  });

  it("converts an imperial export: weight_lbs and distance_miles", () => {
    const h = parse([
      "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe",
      'Run,"3 Feb 2026, 07:00","3 Feb 2026, 07:30",,Running,,,0,normal,,,3.1,1800,',
      'Arms,"3 Feb 2026, 18:00","3 Feb 2026, 19:00",,Bicep Curl (Dumbbell),,,0,normal,30,12,,,',
    ]);
    expect(h.unitsStated).toBe(true);
    expect(setsOf(h)[0]!.distanceM).toBe(4989);
    expect(setsOf(h)[1]!.weightKg).toBe(13.61);
    expect(h.workouts).toHaveLength(2);
  });
});

describe("FitNotes", () => {
  it("reads the Android export, converting each row by its own unit", () => {
    const h = parse([
      "Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment",
      "2024-03-07,Flat Barbell Bench Press,Chest,100.0,kgs,5,,,,",
      "2024-03-07,Flat Barbell Bench Press,Chest,225.0,lbs,5,,,,",
      "2024-03-07,Treadmill,Cardio,,,,2.5,km,0:15:00,",
      "2024-03-08,Plank,Abs,,,,,,0:01:30,",
    ]);
    expect(h.format).toBe("fitnotes-android");
    expect(h.unitsStated).toBe(true);
    // FitNotes has dates only: one workout per day, placed at noon.
    expect(h.workouts.map((w) => [w.start.date, w.start.time, w.timeStated])).toEqual([
      ["2024-03-07", "12:00", false],
      ["2024-03-08", "12:00", false],
    ]);
    expect(h.workouts[0]!.durationS).toBeNull();
    expect(setsOf(h).map((s) => s.weightKg)).toEqual([100, 102.06, null, null]);
    expect(setsOf(h)[2]).toMatchObject({ durationS: 900, distanceM: 2500 });
    expect(setsOf(h)[3]).toMatchObject({ durationS: 90 });
    // Android FitNotes doesn't mark warm-ups, so nothing is skipped as one.
    expect(h.warmupsSkipped).toBe(0);
    expect(h.exercises.find((e) => e.name === "Treadmill")).toMatchObject({
      category: "Cardio", hasDistance: true, hasDuration: true, hasReps: false,
    });
  });

  it("reads the older Android header with the unit in it", () => {
    const h = parse(["Date,Exercise,Category,Weight (lbs),Reps,Distance,Distance Unit,Time", "2020-01-02,Squat,Legs,315,5,,,"]);
    expect(setsOf(h)[0]!.weightKg).toBe(142.88);
  });

  it("reads the iOS export, preferring the kg column and skipping marked warm-ups", () => {
    const h = parse([
      "Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,Distance Unit,Time,Notes,Kind",
      "2024-05-01,Deadlift,Back,60,132.3,5,,,,,Warmup",
      "2024-05-01,Deadlift,Back,180,396.8,3,,,,,Set",
    ]);
    expect(h.format).toBe("fitnotes-ios");
    expect(h.warmupsSkipped).toBe(1);
    expect(setsOf(h)).toEqual([{ weightKg: 180, reps: 3, rpe: null, durationS: null, distanceM: null }]);
  });
});

describe("awkward files", () => {
  it("reports bad rows in the lifter's words and keeps the rest", () => {
    const h = parse([
      "Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time",
      "2024-03-07,,Chest,100,kgs,5,,,",
      "32 Foo 2024,Squat,Legs,100,kgs,5,,,",
      "2024-03-07,Squat,Legs,heavy,kgs,5,,,",
      "2024-03-07,Squat,Legs,,,,,,",
      "2024-03-07,Squat,Legs,120,kgs,5,,,",
    ]);
    expect(h.issues.map((i) => i.message)).toEqual([
      "Row 2 has no exercise name — skipped.",
      "Row 3 has a date we couldn't read (“32 Foo 2024”) — skipped.",
      "Row 4 has a weight we couldn't read (“heavy”) — imported without it.",
    ]);
    expect(h.emptySkipped).toBe(1);
    expect(setsOf(h).map((s) => [s.weightKg, s.reps])).toEqual([[null, 5], [120, 5]]);
  });

  it("copes with a BOM, CRLF and an exercise name with a comma in it", () => {
    const text =
      "﻿Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time\r\n" +
      '2024-03-07,"Bench Press, Close Grip",Chest,80,kgs,8,,,\r\n';
    const result = parseHistoryCsv(text, metric);
    expect(result.ok && result.history.exercises.map((e) => e.name)).toEqual(["Bench Press, Close Grip"]);
  });

  it("treats the same name in different case as one exercise", () => {
    const h = parse([
      "Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time",
      "2024-03-07,Squat,Legs,100,kgs,5,,,",
      "2024-03-08,squat,Legs,105,kgs,5,,,",
    ]);
    expect(h.exercises).toHaveLength(1);
    expect(h.exercises[0]).toMatchObject({ name: "Squat", sets: 2, workouts: 2 });
    expect(h.from).toBe("2024-03-07");
    expect(h.to).toBe("2024-03-08");
  });

  it("says plainly when the file is not one of the three", () => {
    const result = parseHistoryCsv("Name,Email\nSam,sam@example.com", metric);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/doesn't look like a Strong, Hevy or FitNotes export/);
    expect(parseHistoryCsv("", metric)).toEqual({ ok: false, error: "That file is empty." });
  });

  it("drops an RPE outside 1–10 rather than inventing an effort", () => {
    const h = parse([
      "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
      "2024-03-07 18:00:00,Push,1h,Bench Press (Barbell),1,100,5,0,0,,,0",
      "2024-03-07 18:00:00,Push,1h,Bench Press (Barbell),2,100,5,0,0,,,12",
    ]);
    expect(setsOf(h).map((s) => s.rpe)).toEqual([null, null]);
  });
});
