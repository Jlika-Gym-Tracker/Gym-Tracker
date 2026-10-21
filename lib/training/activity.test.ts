import { describe, expect, it } from "vitest";
import {
  ACTIVITY_WEEKS,
  buildActivityYear,
  levelFor,
  sessionMinutes,
  type ActivitySession,
} from "./activity";

// Local timestamps (no zone), so the day a session lands on does not depend on
// the machine running the tests.
const session = (
  id: string,
  start: string,
  minutes: number | null,
  volumeKg = 1000,
  title: string | null = "Push",
): ActivitySession => ({
  id,
  title,
  startedAt: start,
  endedAt:
    minutes == null
      ? null
      : new Date(new Date(start).getTime() + minutes * 60_000).toISOString(),
  volumeKg,
});

// Tuesday 20 October 2026.
const TODAY = new Date(2026, 9, 20, 12);

describe("sessionMinutes", () => {
  it("measures start to finish in whole minutes", () => {
    expect(sessionMinutes("2026-10-20T10:00:00", "2026-10-20T11:05:20")).toBe(65);
  });

  it("has no duration for an open session or a nonsense one", () => {
    expect(sessionMinutes("2026-10-20T10:00:00", null)).toBeNull();
    expect(sessionMinutes("2026-10-20T10:00:00", "2026-10-20T10:00:00")).toBeNull();
    expect(sessionMinutes("2026-10-20T10:00:00", "2026-10-20T09:00:00")).toBeNull();
  });

  it("ignores a session left running for hours", () => {
    expect(sessionMinutes("2026-10-20T10:00:00", "2026-10-21T08:00:00")).toBeNull();
  });
});

describe("levelFor", () => {
  it("splits distinct days into quarters", () => {
    const sorted = [20, 40, 60, 80];
    expect(sorted.map((m) => levelFor(m, sorted))).toEqual([1, 2, 3, 4]);
  });

  it("fits the scale to the person, not to absolute minutes", () => {
    // A 30-minute day is a big day for someone who usually does 15.
    expect(levelFor(30, [10, 15, 15, 30])).toBe(4);
    expect(levelFor(30, [30, 60, 90, 120])).toBe(1);
  });

  it("puts a run of identical days mid-scale", () => {
    expect(levelFor(60, [60, 60, 60, 60])).toBe(3);
    expect(levelFor(45, [45])).toBe(3);
  });

  it("does not let one long outlier flatten everything else", () => {
    const sorted = [40, 45, 50, 55, 60, 65, 70, 300];
    expect(levelFor(70, sorted)).toBe(4);
    expect(levelFor(40, sorted)).toBe(1);
  });
});

describe("buildActivityYear", () => {
  it("lays out 53 weeks of seven days ending with this week", () => {
    const year = buildActivityYear({ sessions: [], today: TODAY, weekStartsOn: 1 });
    expect(year.weeks).toHaveLength(ACTIVITY_WEEKS);
    expect(year.weeks.every((w) => w.length === 7)).toBe(true);
    // The current week starts Monday 19 October.
    expect(year.weeks[52]![0]!.date).toBe("2026-10-19");
    expect(year.weeks[0]![0]!.date).toBe("2025-10-20");
    expect(year.today).toBe("2026-10-20");
  });

  it("starts each column on the user's own week start", () => {
    const sunday = buildActivityYear({ sessions: [], today: TODAY, weekStartsOn: 0 });
    expect(sunday.weeks[52]![0]!.date).toBe("2026-10-18");
    const saturday = buildActivityYear({ sessions: [], today: TODAY, weekStartsOn: 6 });
    expect(saturday.weeks[52]![0]!.date).toBe("2026-10-17");
  });

  it("marks today and dims the days after it", () => {
    const year = buildActivityYear({ sessions: [], today: TODAY, weekStartsOn: 1 });
    const week = year.weeks[52]!;
    expect(week[1]).toMatchObject({ date: "2026-10-20", isToday: true, isFuture: false });
    expect(week[2]).toMatchObject({ isToday: false, isFuture: true });
    expect(week[0]!.isFuture).toBe(false);
  });

  it("sums a day's sessions and lists them in the order they happened", () => {
    const year = buildActivityYear({
      sessions: [
        session("b", "2026-10-19T18:00:00", 30, 500, "Arms"),
        session("a", "2026-10-19T07:00:00", 60, 2000, "Legs"),
      ],
      today: TODAY,
      weekStartsOn: 1,
    });
    const monday = year.weeks[52]![0]!;
    expect(monday.minutes).toBe(90);
    expect(monday.volumeKg).toBe(2500);
    expect(monday.sessions.map((s) => s.title)).toEqual(["Legs", "Arms"]);
    expect(year.totals).toEqual({ sessions: 2, activeDays: 1, minutes: 90 });
  });

  it("shades a session with no measurable duration at the lowest level", () => {
    const year = buildActivityYear({
      sessions: [
        session("a", "2026-10-12T10:00:00", 60),
        session("b", "2026-10-13T10:00:00", 0),
      ],
      today: TODAY,
      weekStartsOn: 1,
    });
    const week = year.weeks[51]!;
    expect(week[0]!.level).toBe(3);
    expect(week[1]).toMatchObject({ level: 1, minutes: 0 });
    expect(week[1]!.sessions[0]!.minutes).toBeNull();
    expect(week[2]!.level).toBe(0);
  });

  it("leaves open sessions and anything outside the year off the grid", () => {
    const year = buildActivityYear({
      sessions: [
        session("open", "2026-10-20T09:00:00", null),
        session("old", "2024-01-10T09:00:00", 60),
      ],
      today: TODAY,
      weekStartsOn: 1,
    });
    expect(year.totals.sessions).toBe(0);
  });

  it("labels each month over the column holding its first day", () => {
    const year = buildActivityYear({ sessions: [], today: TODAY, weekStartsOn: 1 });
    const october = year.months.find((m) => m.label === "Oct");
    // 1 October 2026 is a Thursday, in the week starting Monday 28 September.
    expect(year.weeks[october!.column]![0]!.date).toBe("2026-09-28");
    expect(year.months).toHaveLength(12);
  });
});
