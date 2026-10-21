import { describe, expect, it } from "vitest";
import { validateChanges } from "./changes";
import { fixturePlanOutput, fixtureRefineOutput, fixtureReviewOutput, spreadDays } from "./fixtures";
import { buildCatalog, planForModel } from "./payload";
import { planToWeek, validatePlan } from "./plan";
import { planOutputSchema, reviewOutputSchema, type Intake } from "./schemas";
import { CATALOG, DAY_LABELS } from "./__fixtures__/catalog";

const intake: Intake = {
  goal: "health",
  experience: "new",
  daysPerWeek: 3,
  preferredDays: [],
  sessionMinutes: 45,
  equipment: ["dumbbell", "body_only"],
  limitations: "",
  likes: "",
  dislikes: "",
  shareBodyDetails: false,
};

/** Fixture mode must pass the same checks a real answer does, or clicking through it proves nothing. */
describe("fixture answers", () => {
  const catalog = buildCatalog(CATALOG, intake.equipment);

  it("design a valid week from the person's own catalog", () => {
    const output = planOutputSchema.parse(fixturePlanOutput(catalog, intake));
    const result = validatePlan(output, catalog, intake);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.value.days.filter((d) => !d.is_rest).map((d) => d.day_index)).toEqual(spreadDays(3));
  });

  it("honour preferred days", () => {
    const output = fixturePlanOutput(catalog, { ...intake, preferredDays: [1, 3, 5] });
    expect(output.days.filter((d) => !d.rest).map((d) => d.day_index)).toEqual([1, 3, 5]);
  });

  it("refine into a valid week", () => {
    const first = validatePlan(fixturePlanOutput(catalog, intake), catalog, intake);
    if (!first.ok) throw new Error(first.errors.join());
    const again = validatePlan(planOutputSchema.parse(fixtureRefineOutput(first.value)), catalog, intake);
    expect(again.ok).toBe(true);
  });

  it("review with changes that pass validation", () => {
    const plan = validatePlan(fixturePlanOutput(catalog, intake), catalog, intake);
    if (!plan.ok) throw new Error(plan.errors.join());
    const week = planToWeek(plan.value, { week: null, days: [] });
    const output = reviewOutputSchema.parse(fixtureReviewOutput(planForModel(week, CATALOG, DAY_LABELS)));
    const result = validateChanges(output.changes, week, { catalog: CATALOG, dayLabels: DAY_LABELS, units: "metric" });
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.value).toHaveLength(2);
  });
});
