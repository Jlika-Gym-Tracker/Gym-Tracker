import { describe, expect, it } from "vitest";
import { buildCatalog } from "./payload";
import { checkPlanAgainstCatalog, clip, planToWeek, tidySupersets, validatePlan } from "./plan";
import { planOutputSchema, type PlanOutput } from "./schemas";
import { BROKEN_PLAN_REPLY, PLAN_REPLY } from "./__fixtures__/recorded";
import { CATALOG, bySlug } from "./__fixtures__/catalog";

const reply = (text: string): PlanOutput => planOutputSchema.parse(JSON.parse(text));
const intake = { daysPerWeek: 4 };

describe("validatePlan", () => {
  it("accepts a recorded week and resolves every slug to the library id", () => {
    const result = validatePlan(reply(PLAN_REPLY), CATALOG, intake);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const plan = result.value;
    expect(plan.days).toHaveLength(7);
    expect(plan.days.filter((d) => !d.is_rest)).toHaveLength(4);
    const squat = plan.days[1]!.exercises[0]!;
    expect(squat.exercise_id).toBe(bySlug("barbell-squat").id);
    expect(squat.note).toBe("The backbone of your lower-body strength.");
  });

  it("keeps time movements in seconds and reps movements in reps", () => {
    const result = validatePlan(reply(PLAN_REPLY), CATALOG, intake);
    if (!result.ok) throw new Error(result.errors.join());
    const plank = result.value.days[1]!.exercises.find((e) => e.slug === "plank")!;
    expect(plank).toMatchObject({ rep_min: null, rep_max: null, target_seconds: 40 });
  });

  it("drops overrides that only repeat the day's rule, keeps real ones", () => {
    const result = validatePlan(reply(PLAN_REPLY), CATALOG, intake);
    if (!result.ok) throw new Error(result.errors.join());
    const [upperA, lowerA, , upperB] = result.value.days;
    // linear day, double accessory: a real override
    expect(upperA!.exercises.find((e) => e.slug === "side-lateral-raise")!.progression).toBe("double");
    // linear day maps a timed hold to "time" anyway
    expect(lowerA!.exercises.find((e) => e.slug === "plank")!.progression).toBeNull();
    // double day, double override
    expect(upperB!.exercises.find((e) => e.slug === "dumbbell-shoulder-press")!.progression).toBeNull();
  });

  it("clears a superset with only one member", () => {
    const result = validatePlan(reply(PLAN_REPLY), CATALOG, intake);
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.value.days[3]!.exercises.find((e) => e.slug === "hammer-curls")!.superset_group).toBeNull();
    expect(result.value.days[0]!.exercises.filter((e) => e.superset_group === 1)).toHaveLength(2);
  });

  it("names every problem in a broken reply, for the repair round", () => {
    const result = validatePlan(reply(BROKEN_PLAN_REPLY), CATALOG, intake);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toMatch(/nordic-hamstring-curl" is not in the catalog/);
    expect(result.errors.join("\n")).toMatch(/plank is logged by time, so target_seconds/);
  });

  it("rejects exercises outside the equipment the catalog was narrowed to", () => {
    const dumbbellsOnly = buildCatalog(CATALOG, ["dumbbell"]);
    const result = validatePlan(reply(PLAN_REPLY), dumbbellsOnly, intake);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("barbell-squat"))).toBe(true);
  });

  it("holds the week to the number of days asked for", () => {
    const result = validatePlan(reply(PLAN_REPLY), CATALOG, { daysPerWeek: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("The week has 4 training days but the person asked for 3. Plan exactly 3.");
  });

  it("rejects a rest day with exercises, a training day without, and duplicates", () => {
    const output = reply(PLAN_REPLY);
    output.days[2] = { ...output.days[2]!, exercises: [output.days[0]!.exercises[0]!] };
    output.days[3] = { ...output.days[3]!, exercises: [] };
    output.days[4] = { ...output.days[4]!, exercises: [output.days[4]!.exercises[0]!, output.days[4]!.exercises[0]!] };
    const result = validatePlan(output, CATALOG, intake);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors.join("\n")).toMatch(/marked as rest but lists exercises/);
    expect(result.errors.join("\n")).toMatch(/training day with no exercises/);
    expect(result.errors.join("\n")).toMatch(/appears twice/);
  });

  it("rejects a progression a movement cannot use", () => {
    const output = reply(PLAN_REPLY);
    output.days[1]!.exercises[2] = { ...output.days[1]!.exercises[2]!, progression: "linear" };
    const result = validatePlan(output, CATALOG, intake);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors[0]).toMatch(/plank is a time movement, so its progression must be one of time, off/);
  });

  it("fills missing days as rest", () => {
    const output = reply(PLAN_REPLY);
    output.days = output.days.filter((d) => !d.rest);
    const result = validatePlan(output, CATALOG, intake);
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.value.days.map((d) => d.is_rest)).toEqual([false, false, true, false, false, true, true]);
  });
});

describe("tidySupersets", () => {
  it("pulls split members together behind the first", () => {
    const rows = [
      { id: "a", superset_group: 1 },
      { id: "b", superset_group: null },
      { id: "c", superset_group: 1 },
    ];
    expect(tidySupersets(rows).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });
});

describe("clip", () => {
  it("trims, collapses space, and ellipsises past the limit", () => {
    expect(clip("  a   b  ", 10)).toBe("a b");
    expect(clip("abcdefghijk", 5)).toBe("abcd…");
  });
});

describe("planToWeek", () => {
  it("is always a draft with no planned loads, and keeps the week's notes", () => {
    const result = validatePlan(reply(PLAN_REPLY), CATALOG, intake);
    if (!result.ok) throw new Error(result.errors.join());
    const week = planToWeek(result.value, {
      week: { id: "w1", label: "Old", status: "published", notes: "keep me" },
      days: [],
    });
    expect(week.week).toEqual({ id: "w1", label: "Upper / Lower · 4 days", status: "draft", notes: "keep me" });
    const all = week.days.flatMap((d) => d.exercises);
    expect(all.every((e) => e.target_weight_kg === null && e.id === null)).toBe(true);
    expect(week.days[0]!.exercises.map((e) => e.position)).toEqual([0, 1, 2, 3]);
  });
});

describe("checkPlanAgainstCatalog", () => {
  it("names movements deleted from the library since the draft", () => {
    const result = validatePlan(reply(PLAN_REPLY), CATALOG, intake);
    if (!result.ok) throw new Error(result.errors.join());
    const without = CATALOG.filter((e) => e.slug !== "plank");
    expect(checkPlanAgainstCatalog(result.value, without)).toEqual(["Plank is no longer in your library."]);
  });
});
