import { describe, expect, it } from "vitest";
import {
  bucketLabel,
  effortDisplayScale,
  fromRir,
  rirBucket,
  summariseEffort,
  windowStart,
  type EffortSet,
} from "./effort-stats";

const s = (date: string, rpe: number | null): EffortSet => ({ date, rpe });

describe("rirBucket", () => {
  it("puts whole steps in their own bucket", () => {
    expect([0, 1, 2, 3].map(rirBucket)).toEqual([0, 1, 2, 3]);
  });

  it("rounds half steps up, so the hard line stays at RIR 3", () => {
    expect(rirBucket(0.5)).toBe(1);
    expect(rirBucket(2.5)).toBe(3);
    // RIR 3.5 is not a hard set, so it must not land in a hard bucket.
    expect(rirBucket(3.5)).toBe(4);
  });

  it("gathers everything easier than 3 into 4+", () => {
    expect(rirBucket(4)).toBe(4);
    expect(rirBucket(9)).toBe(4);
  });
});

describe("summariseEffort", () => {
  // Monday 2026-10-05 and Monday 2026-10-12.
  const sets = [
    s("2026-10-05", 8), // RIR 2
    s("2026-10-06", 9), // RIR 1
    s("2026-10-06", null),
    s("2026-10-12", 6), // RIR 4
    s("2026-10-13", 10), // RIR 0
    s("2026-10-14", 7), // RIR 3
    s("2026-10-19", 8), // alone in its week
  ];

  it("counts coverage against every completed set", () => {
    const summary = summariseEffort(sets);
    expect(summary.total).toBe(7);
    expect(summary.rated).toBe(6);
  });

  it("averages in RIR and shares out the hard sets", () => {
    const summary = summariseEffort(sets);
    expect(summary.averageRir).toBeCloseTo((2 + 1 + 4 + 0 + 3 + 2) / 6, 10);
    // Hard is RIR ≤ 3: everything but the RIR 4 set.
    expect(summary.hardShare).toBeCloseTo(5 / 6, 10);
  });

  it("gives no average below the minimum number of ratings", () => {
    const summary = summariseEffort([s("2026-10-05", 8), s("2026-10-06", 9), s("2026-10-07", null)]);
    expect(summary.rated).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.averageRir).toBeNull();
    expect(summary.hardShare).toBeNull();
  });

  it("averages week by week and drops thinly rated weeks", () => {
    const { weekly } = summariseEffort(sets, { weekStartsOn: 1 });
    expect(weekly).toEqual([
      { weekStart: "2026-10-05", averageRir: 1.5, rated: 2 },
      { weekStart: "2026-10-12", averageRir: 7 / 3, rated: 3 },
    ]);
  });

  it("groups weeks on the user's own start day", () => {
    // A Sunday start puts Sun 2026-10-11 … Sat 2026-10-17 together.
    const { weekly } = summariseEffort(
      [s("2026-10-11", 8), s("2026-10-12", 8), s("2026-10-18", 8), s("2026-10-19", 8)],
      { weekStartsOn: 0 },
    );
    expect(weekly.map((w) => w.weekStart)).toEqual(["2026-10-11", "2026-10-18"]);
  });

  it("spreads ratings across whole steps, easiest first", () => {
    const { distribution } = summariseEffort(sets);
    expect(distribution).toEqual([
      { bucket: 4, count: 1 },
      { bucket: 3, count: 1 },
      { bucket: 2, count: 2 },
      { bucket: 1, count: 1 },
      { bucket: 0, count: 1 },
    ]);
  });

  it("only reads sets inside the window", () => {
    const summary = summariseEffort(sets, { since: "2026-10-12" });
    expect(summary.total).toBe(4);
    expect(summary.rated).toBe(4);
  });

  it("is empty for no sets", () => {
    const summary = summariseEffort([]);
    expect(summary).toMatchObject({ total: 0, rated: 0, averageRir: null, weekly: [] });
  });
});

describe("windowStart", () => {
  const today = new Date(2026, 9, 20);

  it("counts today as the last day of the window", () => {
    expect(windowStart("30d", today)).toBe("2026-09-21");
    expect(windowStart("90d", today)).toBe("2026-07-23");
  });

  it("has no start for all time", () => {
    expect(windowStart("all", today)).toBeNull();
  });
});

describe("display scale", () => {
  it("hides everything when nothing was ever rated", () => {
    expect(effortDisplayScale("rpe", false)).toBeNull();
    expect(effortDisplayScale("rir", false)).toBeNull();
  });

  it("falls back to RPE when the column is off but history exists", () => {
    expect(effortDisplayScale("off", true)).toBe("rpe");
    expect(effortDisplayScale("rir", true)).toBe("rir");
  });

  it("converts RIR to the reader's scale", () => {
    expect(fromRir(2, "rir")).toBe(2);
    expect(fromRir(2, "rpe")).toBe(8);
    expect(fromRir(1.5, "rpe")).toBe(8.5);
  });

  it("labels whole steps in either scale", () => {
    expect(["rir", "rpe"].map((sc) => bucketLabel(4, sc as "rir" | "rpe"))).toEqual(["4+", "≤6"]);
    expect(bucketLabel(0, "rpe")).toBe("10");
    expect(bucketLabel(2, "rpe")).toBe("8");
    expect(bucketLabel(2, "rir")).toBe("2");
  });
});
