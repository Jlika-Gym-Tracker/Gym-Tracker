import { describe, expect, it } from "vitest";
import {
  displayToKg,
  formatDuration,
  formatVolume,
  formatWeight,
  kgToDisplay,
  trimNumber,
} from "./units";

describe("weight conversion", () => {
  it("leaves metric untouched", () => {
    expect(kgToDisplay(80, "metric")).toBe(80);
    expect(displayToKg(80, "metric")).toBe(80);
  });

  it("converts to pounds and back without drift", () => {
    const lb = kgToDisplay(100, "imperial");
    expect(lb).toBeCloseTo(220.46, 2);
    expect(displayToKg(lb, "imperial")).toBeCloseTo(100, 10);
  });
});

describe("trimNumber", () => {
  it("drops trailing zeros but keeps meaningful decimals", () => {
    expect(trimNumber(32.5)).toBe("32.5");
    expect(trimNumber(32.0)).toBe("32");
    expect(trimNumber(32.04, 1)).toBe("32");
  });

  it("does not print NaN at the user", () => {
    expect(trimNumber(Number.NaN)).toBe("—");
  });
});

describe("formatWeight", () => {
  it("shows an em-dash for nothing logged", () => {
    expect(formatWeight(null, "metric")).toBe("—");
  });

  it("formats in the viewer's system", () => {
    expect(formatWeight(100, "metric")).toBe("100");
    expect(formatWeight(100, "imperial")).toBe("220.5");
  });
});

describe("formatVolume", () => {
  it("abbreviates thousands", () => {
    expect(formatVolume(42300, "metric")).toBe("42.3k");
  });

  it("keeps small numbers whole", () => {
    expect(formatVolume(880, "metric")).toBe("880");
  });
});

describe("formatDuration", () => {
  it("formats mm:ss below an hour", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(95)).toBe("01:35");
    expect(formatDuration(1935)).toBe("32:15");
  });

  it("adds hours when it runs long", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("never shows negative time", () => {
    expect(formatDuration(-10)).toBe("00:00");
  });
});
