import { describe, expect, it } from "vitest";
import {
  isReminderHour, localClock, reminderText, selectReminders, trainingDayOn,
  type ReminderCandidate, type ReminderWeek,
} from "./reminder";

// A Monday-start week: Mon push, Tue rest, Wed pull, Thu written but empty.
const WEEK: ReminderWeek = {
  weekStart: "2026-10-19",
  status: "published",
  days: [
    { dayIndex: 0, name: "Push", isRest: false, exerciseCount: 5 },
    { dayIndex: 1, name: "Rest", isRest: true, exerciseCount: 0 },
    { dayIndex: 2, name: "Pull", isRest: false, exerciseCount: 6 },
    { dayIndex: 3, name: "Legs", isRest: false, exerciseCount: 0 },
  ],
};

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    userId: "u1",
    timezone: "Europe/Paris",
    reminderHour: 18,
    weeks: [WEEK],
    sessionStarts: [],
    ...overrides,
  };
}

// Wednesday 21 Oct 2026, 16:20 UTC = 18:20 in Paris (CEST, +02:00).
const WED_18_PARIS = new Date("2026-10-21T16:20:00Z");

describe("localClock", () => {
  it("reads the date and hour in the lifter's zone", () => {
    expect(localClock(WED_18_PARIS, "Europe/Paris")).toEqual({ date: "2026-10-21", hour: 18 });
    expect(localClock(WED_18_PARIS, "America/Los_Angeles")).toEqual({ date: "2026-10-21", hour: 9 });
    expect(localClock(new Date("2026-10-21T23:30:00Z"), "Asia/Tokyo")).toEqual({ date: "2026-10-22", hour: 8 });
  });

  it("falls back to UTC for a zone it doesn't know", () => {
    expect(localClock(WED_18_PARIS, "Mars/Olympus_Mons")).toEqual({ date: "2026-10-21", hour: 16 });
  });

  it("puts half-hour zones in the hour they're in", () => {
    // 12:00 UTC is 17:30 in India.
    expect(isReminderHour(new Date("2026-10-21T12:00:00Z"), "Asia/Kolkata", 17)).toBe(true);
  });
});

describe("trainingDayOn", () => {
  it("finds today's day by its position in the published week", () => {
    expect(trainingDayOn("2026-10-19", [WEEK])).toEqual({ name: "Push" });
    expect(trainingDayOn("2026-10-21", [WEEK])).toEqual({ name: "Pull" });
  });

  it("stays quiet on a rest day, an empty day, a day not written, or outside the week", () => {
    expect(trainingDayOn("2026-10-20", [WEEK])).toBeNull();
    expect(trainingDayOn("2026-10-22", [WEEK])).toBeNull();
    expect(trainingDayOn("2026-10-23", [WEEK])).toBeNull();
    expect(trainingDayOn("2026-10-26", [WEEK])).toBeNull();
  });

  it("ignores a draft week", () => {
    expect(trainingDayOn("2026-10-19", [{ ...WEEK, status: "draft" }])).toBeNull();
  });

  it("reads a week that starts on a Saturday from its own start", () => {
    const saturday: ReminderWeek = {
      weekStart: "2026-10-17",
      status: "published",
      days: [{ dayIndex: 2, name: "Upper A", isRest: false, exerciseCount: 4 }],
    };
    expect(trainingDayOn("2026-10-19", [saturday])).toEqual({ name: "Upper A" });
  });
});

describe("selectReminders", () => {
  it("reminds at the chosen local hour on a training day with no session yet", () => {
    expect(selectReminders(WED_18_PARIS, [candidate()])).toEqual([{ userId: "u1", dayName: "Pull" }]);
  });

  it("waits for the right hour", () => {
    expect(selectReminders(WED_18_PARIS, [candidate({ reminderHour: 17 })])).toEqual([]);
  });

  it("stays quiet once a session has started today, in their zone", () => {
    // 07:00 Paris on Wednesday.
    expect(selectReminders(WED_18_PARIS, [candidate({ sessionStarts: ["2026-10-21T05:00:00Z"] })])).toEqual([]);
  });

  it("does not count yesterday's late session as today's", () => {
    // 23:30 Paris on Tuesday — still Tuesday there, though it's Wednesday in some zones.
    expect(
      selectReminders(WED_18_PARIS, [candidate({ sessionStarts: ["2026-10-20T21:30:00Z"] })]),
    ).toHaveLength(1);
  });

  it("decides each person in their own zone", () => {
    const reminders = selectReminders(WED_18_PARIS, [
      candidate({ userId: "paris" }),
      candidate({ userId: "la", timezone: "America/Los_Angeles" }),
      candidate({ userId: "la-early", timezone: "America/Los_Angeles", reminderHour: 9 }),
    ]);
    expect(reminders.map((r) => r.userId)).toEqual(["paris", "la-early"]);
  });
});

describe("reminderText", () => {
  it("names the day", () => {
    expect(reminderText("Pull").body).toBe("Today is Pull — your session is waiting");
  });
});
