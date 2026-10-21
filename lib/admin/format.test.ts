import { describe, expect, it } from "vitest";
import { formatAgo, formatClock, formatDay, formatElapsed } from "@/lib/admin/format";

describe("formatElapsed", () => {
  it("floors to the minute and pads past an hour", () => {
    expect(formatElapsed(0)).toBe("<1m");
    expect(formatElapsed(59_999)).toBe("<1m");
    expect(formatElapsed(8 * 60_000 + 59_000)).toBe("8m");
    expect(formatElapsed(65 * 60_000)).toBe("1h 05m");
    expect(formatElapsed(3 * 3_600_000 + 59 * 60_000)).toBe("3h 59m");
  });

  it("never goes negative when clocks disagree", () => {
    expect(formatElapsed(-5_000)).toBe("<1m");
  });
});

describe("formatAgo", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("steps from minutes to hours to days to a date", () => {
    expect(formatAgo(null, now)).toBe("never");
    expect(formatAgo("2026-10-20T11:59:30Z", now)).toBe("just now");
    expect(formatAgo("2026-10-20T11:55:00Z", now)).toBe("5m ago");
    expect(formatAgo("2026-10-20T09:00:00Z", now)).toBe("3h ago");
    expect(formatAgo("2026-10-08T12:00:00Z", now)).toBe("12d ago");
    expect(formatAgo("2026-09-01T12:00:00Z", now)).toBe("Sep 1, 2026");
  });
});

describe("formatDay and formatClock", () => {
  it("write UTC, so server and browser agree", () => {
    expect(formatDay("2026-10-03T23:30:00Z")).toBe("Oct 3, 2026");
    expect(formatDay("2026-10-04T00:30:00+02:00")).toBe("Oct 3, 2026");
    expect(formatClock("2026-10-03T09:04:59Z")).toBe("09:04 UTC");
    expect(formatClock("2026-10-04T00:30:00+02:00")).toBe("22:30 UTC");
  });
});
