import { describe, expect, it } from "vitest";
import type { PreviousBest } from "./records";
import {
  buildMonthGrid,
  durationLabel,
  foldBests,
  groupSessions,
  monthLabel,
  monthRange,
  monthTotals,
  readHistoryParams,
  recordCounts,
  shiftMonth,
  type MonthSet,
} from "./history";

// Tuesday 20 October 2026, local time.
const TODAY = new Date(2026, 9, 20, 12);

// Local timestamps (no zone), so the day a session lands on does not depend on
// the machine running the tests.
const at = (local: string) => new Date(local).toISOString();

const lift = (sessionId: string, exerciseId: string, weightKg: number, reps: number): MonthSet => ({
  sessionId, exerciseId, tracking: "reps", weightKg, reps, durationS: null,
});
const hold = (sessionId: string, exerciseId: string, seconds: number): MonthSet => ({
  sessionId, exerciseId, tracking: "time", weightKg: null, reps: null, durationS: seconds,
});

describe("readHistoryParams", () => {
  it("defaults to this month with no day", () => {
    expect(readHistoryParams({}, TODAY)).toEqual({ month: "2026-10", day: null });
  });

  it("reads a month and a day inside it", () => {
    expect(readHistoryParams({ month: "2025-03", day: "2025-03-14" }, TODAY)).toEqual({
      month: "2025-03",
      day: "2025-03-14",
    });
  });

  it("takes the month from the day when only a day is given", () => {
    expect(readHistoryParams({ day: "2026-09-02" }, TODAY)).toEqual({ month: "2026-09", day: "2026-09-02" });
  });

  it("drops a day that is not in the month shown", () => {
    expect(readHistoryParams({ month: "2026-08", day: "2026-09-02" }, TODAY)).toEqual({
      month: "2026-08",
      day: null,
    });
  });

  it("ignores malformed and impossible values", () => {
    expect(readHistoryParams({ month: "2026-13", day: "2026-02-31" }, TODAY)).toEqual({
      month: "2026-10",
      day: null,
    });
    expect(readHistoryParams({ month: ["2026-01", "2026-02"], day: "yesterday" }, TODAY)).toEqual({
      month: "2026-10",
      day: null,
    });
  });

  it("pulls a future month back to this one", () => {
    expect(readHistoryParams({ month: "2027-01" }, TODAY).month).toBe("2026-10");
  });
});

describe("month arithmetic", () => {
  it("steps across year ends", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("spans local midnight on the 1st to the 1st of the next month", () => {
    const { start, end } = monthRange("2026-02");
    expect(start).toEqual(new Date(2026, 1, 1));
    expect(end).toEqual(new Date(2026, 2, 1));
  });

  it("names the month", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});

describe("buildMonthGrid", () => {
  const counts = new Map([
    ["2026-10-01", 1],
    ["2026-10-14", 2],
  ]);

  it("starts each row on a Monday by default and blanks other months' days", () => {
    const weeks = buildMonthGrid({ month: "2026-10", weekStartsOn: 1, counts, today: TODAY });
    // 1 October 2026 is a Thursday: Mon–Wed of that row belong to September.
    expect(weeks[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0]![3]).toMatchObject({ date: "2026-10-01", dayOfMonth: 1, sessions: 1 });
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("honours a Sunday or Saturday start", () => {
    const sunday = buildMonthGrid({ month: "2026-10", weekStartsOn: 0, counts, today: TODAY });
    expect(sunday[0]!.findIndex(Boolean)).toBe(4);
    const saturday = buildMonthGrid({ month: "2026-10", weekStartsOn: 6, counts, today: TODAY });
    expect(saturday[0]!.findIndex(Boolean)).toBe(5);
  });

  it("marks today, the future and the days trained", () => {
    const days = buildMonthGrid({ month: "2026-10", weekStartsOn: 1, counts, today: TODAY }).flat();
    expect(days.find((d) => d?.date === "2026-10-20")).toMatchObject({ isToday: true, isFuture: false });
    expect(days.find((d) => d?.date === "2026-10-21")).toMatchObject({ isToday: false, isFuture: true });
    expect(days.find((d) => d?.date === "2026-10-14")?.sessions).toBe(2);
    expect(days.find((d) => d?.date === "2026-10-15")?.sessions).toBe(0);
  });
});

describe("groupSessions", () => {
  const sessions = [
    { id: "evening", title: "Legs", startedAt: at("2026-10-14T18:00:00"), endedAt: at("2026-10-14T19:05:00") },
    { id: "morning", title: "Run", startedAt: at("2026-10-14T07:00:00"), endedAt: at("2026-10-14T07:30:00") },
    { id: "earlier", title: null, startedAt: at("2026-10-02T18:00:00"), endedAt: at("2026-10-03T08:00:00") },
  ];
  const sets: MonthSet[] = [
    lift("evening", "squat", 100, 5),
    lift("evening", "squat", 100, 5),
    lift("evening", "curl", 20, 10),
    hold("evening", "plank", 60),
    { sessionId: "morning", exerciseId: "run", tracking: "cardio", weightKg: null, reps: null, durationS: 1800 },
  ];

  it("files sessions by start day, newest day first and each day in order", () => {
    const days = groupSessions(sessions, sets);
    expect(days.map((d) => d.date)).toEqual(["2026-10-14", "2026-10-02"]);
    expect(days[0]!.sessions.map((s) => s.id)).toEqual(["morning", "evening"]);
  });

  it("counts sets, movements, minutes and volume from weight-and-reps work only", () => {
    const evening = groupSessions(sessions, sets)[0]!.sessions[1]!;
    expect(evening).toMatchObject({ sets: 4, exercises: 3, minutes: 65, volumeKg: 1200 });
  });

  it("leaves a session left open overnight without a length", () => {
    const earlier = groupSessions(sessions, sets)[1]!.sessions[0]!;
    expect(earlier).toMatchObject({ minutes: null, sets: 0, volumeKg: 0 });
  });

  it("totals the month", () => {
    expect(monthTotals(groupSessions(sessions, sets))).toEqual({
      sessions: 3,
      days: 2,
      minutes: 95,
      volumeKg: 1200,
    });
  });
});

describe("durationLabel", () => {
  it("reads in minutes under an hour and hours past it", () => {
    expect(durationLabel(48)).toBe("48 min");
    expect(durationLabel(60)).toBe("1 h");
    expect(durationLabel(65)).toBe("1 h 05 min");
  });
});

describe("foldBests", () => {
  it("carries the best set, heaviest bar and longest hold forward", () => {
    const bests = new Map<string, PreviousBest>();
    foldBests(bests, [lift("a", "bench", 100, 5), lift("a", "bench", 120, 1), hold("a", "plank", 45)]);
    foldBests(bests, [lift("b", "bench", 90, 10), hold("b", "plank", 30)]);
    // 90 × 10 → e1RM 120, ties 120 × 1, so the earlier set stays the best.
    expect(bests.get("bench")).toEqual({ bestSet: { weight_kg: 120, reps: 1 }, heaviestKg: 120, longestS: 0 });
    expect(bests.get("plank")).toEqual({ bestSet: null, heaviestKg: 0, longestS: 45 });
  });
});

describe("recordCounts", () => {
  const session = (id: string, startedAt: string, sets: MonthSet[]) => ({ id, startedAt: at(startedAt), sets });

  it("judges each session only against the ones before it", () => {
    const counts = recordCounts([
      // Given out of order on purpose.
      session("third", "2026-10-14T18:00:00", [lift("third", "bench", 105, 5)]),
      session("first", "2026-10-01T18:00:00", [lift("first", "bench", 95, 5), hold("first", "plank", 40)]),
      session("second", "2026-10-07T18:00:00", [lift("second", "bench", 100, 5), hold("second", "plank", 60)]),
    ]);
    // The first is a baseline; the second beats it twice; the third beats the
    // second — and the second keeps its records even though the third is better.
    expect(Object.fromEntries(counts)).toEqual({ first: 0, second: 2, third: 1 });
  });

  it("does not count a match as a record", () => {
    const counts = recordCounts([
      session("a", "2026-10-01T18:00:00", [lift("a", "bench", 100, 5)]),
      session("b", "2026-10-08T18:00:00", [lift("b", "bench", 100, 5)]),
    ]);
    expect(counts.get("b")).toBe(0);
  });

  it("counts one record per movement however many sets beat the old best", () => {
    const counts = recordCounts([
      session("a", "2026-10-01T18:00:00", [lift("a", "bench", 100, 5)]),
      session("b", "2026-10-08T18:00:00", [lift("b", "bench", 105, 5), lift("b", "bench", 110, 5)]),
    ]);
    expect(counts.get("b")).toBe(1);
  });
});
