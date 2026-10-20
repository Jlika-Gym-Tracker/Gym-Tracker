import { describe, expect, it } from "vitest";
import { metresPer, minutesBetween, readDateTime, readDuration, readNumber, readWeightUnit } from "./values";

describe("readNumber", () => {
  it("tells a blank cell from an unreadable one", () => {
    expect(readNumber("")).toBeNull();
    expect(readNumber("  ")).toBeNull();
    expect(readNumber("heavy")).toBeUndefined();
  });

  it("reads decimal commas from comma-decimal locales", () => {
    expect(readNumber("102,5")).toBe(102.5);
    expect(readNumber(" 80 ")).toBe(80);
  });
});

describe("readDuration", () => {
  it("reads the spellings the exports use", () => {
    expect(readDuration("90")).toBe(90);
    expect(readDuration("1:30")).toBe(90);
    expect(readDuration("0:30:00")).toBe(1800);
    expect(readDuration("1h 5m")).toBe(3900);
    expect(readDuration("38m")).toBe(2280);
    expect(readDuration("2h")).toBe(7200);
    expect(readDuration("45s")).toBe(45);
  });

  it("returns null for blank and undefined for nonsense", () => {
    expect(readDuration("")).toBeNull();
    expect(readDuration("a while")).toBeUndefined();
  });
});

describe("readDateTime", () => {
  it("reads Strong's timestamp", () => {
    expect(readDateTime("2020-12-30 18:51:52")).toEqual({
      at: { date: "2020-12-30", time: "18:51" },
      timeStated: true,
    });
  });

  it("reads FitNotes' bare date and says the time was not stated", () => {
    expect(readDateTime("2024-03-07")).toEqual({
      at: { date: "2024-03-07", time: "12:00" },
      timeStated: false,
    });
  });

  it("reads Hevy's day-first and month-first forms", () => {
    expect(readDateTime("12 Jan 2026, 18:00")?.at).toEqual({ date: "2026-01-12", time: "18:00" });
    expect(readDateTime("Jan 12, 2026, 6:05 PM")?.at).toEqual({ date: "2026-01-12", time: "18:05" });
    expect(readDateTime("12 January 2026, 12:30 am")?.at).toEqual({ date: "2026-01-12", time: "00:30" });
  });

  it("refuses dates that don't exist and ambiguous numeric ones", () => {
    expect(readDateTime("2024-02-30")).toBeNull();
    expect(readDateTime("07/03/2024")).toBeNull();
    expect(readDateTime("")).toBeNull();
  });
});

describe("minutesBetween", () => {
  it("counts across midnight", () => {
    expect(
      minutesBetween({ date: "2024-01-01", time: "23:30" }, { date: "2024-01-02", time: "00:45" }),
    ).toBe(75);
  });
});

describe("units", () => {
  it("reads weight units as FitNotes writes them", () => {
    expect(readWeightUnit("kgs")).toBe("kg");
    expect(readWeightUnit("lbs")).toBe("lb");
    expect(readWeightUnit("stone")).toBeNull();
  });

  it("knows how many metres each distance unit is", () => {
    expect(metresPer("km")).toBe(1000);
    expect(metresPer("mi")).toBe(1609.344);
    expect(metresPer("Metres")).toBe(1);
    expect(metresPer("furlongs")).toBeNull();
  });
});
