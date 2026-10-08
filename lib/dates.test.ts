import { describe, expect, it } from "vitest";
import {
  currentWeekStart,
  dayLabel,
  isInWeek,
  weekDayNames,
  weekRangeLabel,
} from "./dates";

// Thursday 8 October 2026.
const THURSDAY = new Date(2026, 9, 8);

describe("currentWeekStart", () => {
  it("defaults to the Monday on or before the date", () => {
    expect(currentWeekStart(THURSDAY)).toBe("2026-10-05");
  });

  it("follows whichever weekday the user's week begins on", () => {
    expect(currentWeekStart(THURSDAY, 6)).toBe("2026-10-03"); // Saturday
    expect(currentWeekStart(THURSDAY, 0)).toBe("2026-10-04"); // Sunday
    expect(currentWeekStart(THURSDAY, 4)).toBe("2026-10-08"); // Thursday itself
  });

  it("stays on the same day when the week starts the day after", () => {
    // Friday-start: Thursday belongs to the week that began the previous Friday.
    expect(currentWeekStart(THURSDAY, 5)).toBe("2026-10-02");
  });
});

describe("dayLabel", () => {
  it("names the weekday a position actually falls on", () => {
    expect(dayLabel("2026-10-05", 0)).toBe("Mon");
    expect(dayLabel("2026-10-05", 6)).toBe("Sun");
  });

  it("follows a week that begins on a Saturday", () => {
    expect(dayLabel("2026-10-03", 0)).toBe("Sat");
    expect(dayLabel("2026-10-03", 1)).toBe("Sun");
    expect(dayLabel("2026-10-03", 2)).toBe("Mon");
  });
});

describe("weekDayNames", () => {
  it("rotates to the user's start day", () => {
    expect(weekDayNames(1)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(weekDayNames(6)).toEqual(["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(weekDayNames(0)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
});

describe("isInWeek", () => {
  it("covers the seven days from the start, and nothing either side", () => {
    expect(isInWeek("2026-10-05", new Date(2026, 9, 5))).toBe(true);
    expect(isInWeek("2026-10-05", new Date(2026, 9, 11))).toBe(true);
    expect(isInWeek("2026-10-05", new Date(2026, 9, 4))).toBe(false);
    expect(isInWeek("2026-10-05", new Date(2026, 9, 12))).toBe(false);
  });

  it("works for a week that does not start on a Monday", () => {
    // The Saturday week covering this Thursday.
    expect(isInWeek("2026-10-03", THURSDAY)).toBe(true);
    expect(isInWeek("2026-10-10", THURSDAY)).toBe(false);
  });
});

describe("weekRangeLabel", () => {
  it("spans seven days inclusive", () => {
    expect(weekRangeLabel("2026-10-03")).toBe("Oct 03 – Oct 09");
  });
});
