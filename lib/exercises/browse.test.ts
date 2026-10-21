import { describe, expect, it } from "vitest";
import { SEEDED_LIBRARY } from "@/lib/program/__fixtures__/library";
import { FULL_LIBRARY_SAMPLE } from "@/lib/program/__fixtures__/full-library-sample";
import type { LibraryExercise } from "@/lib/program/match";
import { BROWSE_PAGE, browseHref, browseLibrary, parseBrowseParams, type BrowseParams } from "./browse";

const OWN: LibraryExercise = {
  id: "00000000-0000-4000-a000-000000000001",
  name: "Zz Sissy Squat",
  slug: "u-12345678-zz-sissy-squat",
  aliases: [],
  primary_muscle: "quadriceps",
  equipment: "body_only",
  image_start_url: null,
  tracking: "reps",
  owner_id: "12345678-0000-4000-8000-000000000000",
  featured: false,
  archived_at: null,
};
const REMOVED: LibraryExercise = { ...OWN, id: "00000000-0000-4000-a000-000000000002", name: "Old Thing", slug: "u-old", archived_at: "2026-10-01T00:00:00Z" };
const LIBRARY = [...FULL_LIBRARY_SAMPLE, ...SEEDED_LIBRARY, OWN, REMOVED];
const params = (patch: Partial<BrowseParams> = {}): BrowseParams => ({ ...parseBrowseParams({}), ...patch });

describe("parseBrowseParams", () => {
  it("keeps what it recognises and drops the rest", () => {
    expect(
      parseBrowseParams({ q: "  bench ", group: "legs", eq: "barbell,spaceship,barbell", as: "time", n: "80" }),
    ).toEqual({ q: "bench", group: "legs", equipment: ["barbell"], tracking: "time", shown: 80 });
    expect(parseBrowseParams({ group: "toes", as: "swim", n: "-5" })).toEqual({
      q: "", group: null, equipment: [], tracking: null, shown: BROWSE_PAGE,
    });
  });
});

describe("browseHref", () => {
  it("writes only what differs from the defaults and starts a changed list from the top", () => {
    const current = params({ group: "legs", shown: 120 });
    expect(browseHref(current, { tracking: "cardio" })).toBe("/exercises?group=legs&as=cardio");
    expect(browseHref(current, { shown: 160 })).toBe("/exercises?group=legs&n=160");
    expect(browseHref(params())).toBe("/exercises");
  });
});

describe("browseLibrary", () => {
  it("lists featured movements and your own first, then the long tail", () => {
    const { rows, tailStart, total } = browseLibrary(LIBRARY, params({ shown: 2000 }));
    expect(total).toBe(LIBRARY.length - 1);
    expect(rows).not.toContain(REMOVED);
    expect(tailStart).toBe(SEEDED_LIBRARY.length + 1);
    expect(rows.slice(0, tailStart!).every((e) => e.featured || e.owner_id)).toBe(true);
    expect(rows.slice(tailStart!).some((e) => e.featured || e.owner_id)).toBe(false);
    expect(rows.slice(0, tailStart!)).toContain(OWN);
  });

  it("pages, and marks no break when the first page is all featured", () => {
    const { rows, tailStart } = browseLibrary(LIBRARY, params());
    expect(rows).toHaveLength(BROWSE_PAGE);
    expect(tailStart).toBeNull();
  });

  it("searches everything, by relevance", () => {
    const { rows, tailStart } = browseLibrary(LIBRARY, params({ q: "sumo deadlift" }));
    expect(rows[0]!.name).toBe("Sumo Deadlift");
    expect(tailStart).toBeNull();
  });

  it("filters by muscle group, leaving cardio out unless asked for", () => {
    const legs = browseLibrary(LIBRARY, params({ group: "legs", shown: 2000 })).rows;
    expect(legs.length).toBeGreaterThan(10);
    expect(legs.every((e) => ["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"].includes(e.primary_muscle))).toBe(true);
    expect(legs.some((e) => e.tracking === "cardio")).toBe(false);
    const cardio = browseLibrary(LIBRARY, params({ group: "legs", tracking: "cardio" })).rows;
    expect(cardio.map((e) => e.name)).toEqual(["Jogging, Treadmill"]);
  });

  it("filters by how a movement is logged", () => {
    const timed = { ...OWN, id: "00000000-0000-4000-a000-000000000003", name: "Dead Hang", tracking: "time" as const };
    expect(browseLibrary([...LIBRARY, timed], params({ tracking: "time" })).rows).toEqual([timed]);
    const reps = browseLibrary(LIBRARY, params({ tracking: "reps", shown: 2000 })).rows;
    expect(reps.length).toBe(LIBRARY.length - 2);
  });

  it("offers only equipment with results, and drops a chip the other filters emptied", () => {
    const chest = browseLibrary(LIBRARY, params({ group: "chest", equipment: ["foam_roll", "cable"] }));
    expect(chest.equipmentOptions).not.toContain("foam_roll");
    expect(chest.activeEquipment).toEqual(["cable"]);
    expect(chest.rows.every((e) => e.equipment === "cable" && e.primary_muscle === "chest")).toBe(true);
  });
});
