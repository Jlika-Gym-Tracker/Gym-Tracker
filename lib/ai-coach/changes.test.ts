import { describe, expect, it } from "vitest";
import { applyChanges, validateChanges } from "./changes";
import { planToWeek, validatePlan } from "./plan";
import { planOutputSchema, reviewOutputSchema, type Change, type WeekSnapshot } from "./schemas";
import { PLAN_REPLY, REVIEW_REPLY } from "./__fixtures__/recorded";
import { CATALOG, DAY_LABELS, bySlug } from "./__fixtures__/catalog";

const context = { catalog: CATALOG, dayLabels: DAY_LABELS, units: "metric" as const };

function baseWeek(): WeekSnapshot {
  const plan = validatePlan(planOutputSchema.parse(JSON.parse(PLAN_REPLY)), CATALOG, { daysPerWeek: 4 });
  if (!plan.ok) throw new Error(plan.errors.join());
  const week = planToWeek(plan.value, { week: { id: "w", label: "x", status: "published", notes: null }, days: [] });
  // A planned load on the squat, as copy-last-week would leave it.
  week.days[1]!.exercises[0]!.target_weight_kg = 100;
  return week;
}

const recorded = () => reviewOutputSchema.parse(JSON.parse(REVIEW_REPLY)).changes;

const reasons = (changes: Change[]) => {
  const result = validateChanges(changes, baseWeek(), context);
  if (result.ok) throw new Error("expected the changes to be refused");
  return result.errors.join("\n");
};

describe("validateChanges", () => {
  it("accepts a recorded review and renders before → after from the plan", () => {
    const result = validateChanges(recorded(), baseWeek(), context);
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.value.map(({ target, before, after }) => ({ target, before, after }))).toEqual([
      { target: "Mon · Upper A — Barbell Bench Press - Medium Grip", before: "5 reps", after: "6–8 reps" },
      { target: "Mon · Upper A — Side Lateral Raise", before: "3 sets", after: "4 sets" },
      {
        target: "Fri · Lower B — Bulgarian Split Squat",
        before: "Bulgarian Split Squat · 3 × 8–10",
        after: "Dumbbell Lunges · 3 × 8–10",
      },
    ]);
  });

  it("quietly drops a change that would do nothing", () => {
    const result = validateChanges(
      [{ type: "set_sets", day_index: 0, exercise: "side-lateral-raise", sets: 3, rationale: "same" }],
      baseWeek(),
      context,
    );
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("refuses two changes to the same exercise, so any subset applies cleanly", () => {
    expect(
      reasons([
        { type: "set_sets", day_index: 0, exercise: "side-lateral-raise", sets: 4, rationale: "a" },
        { type: "remove_exercise", day_index: 0, exercise: "side-lateral-raise", rationale: "b" },
      ]),
    ).toMatch(/both touch day 0 side-lateral-raise/);
  });

  it("refuses exercises that are not in the library or not on that day", () => {
    expect(reasons([{ type: "set_sets", day_index: 0, exercise: "cable-fly", sets: 4, rationale: "r" }])).toMatch(
      /"cable-fly" is not in the catalog/,
    );
    expect(reasons([{ type: "set_sets", day_index: 1, exercise: "side-lateral-raise", sets: 4, rationale: "r" }])).toMatch(
      /side-lateral-raise is not on day 1/,
    );
  });

  it("only swaps like for like", () => {
    expect(
      reasons([
        { type: "swap_exercise", day_index: 0, exercise: "triceps-pushdown", to_exercise: "farmers-walk", why: "w", rationale: "r" },
      ]),
    ).toMatch(/swap only like for like/);
  });

  it("keeps reps, times and loads to the movements that have them", () => {
    expect(
      reasons([{ type: "set_rep_range", day_index: 1, exercise: "plank", rep_min: 5, rep_max: 8, rationale: "r" }]),
    ).toMatch(/logged by time, not reps/);
    expect(
      reasons([{ type: "set_target_seconds", day_index: 1, exercise: "barbell-squat", target_seconds: 60, rationale: "r" }]),
    ).toMatch(/logged in reps, not time/);
    expect(
      reasons([{ type: "set_rep_range", day_index: 1, exercise: "barbell-squat", rep_min: 8, rep_max: 5, rationale: "r" }]),
    ).toMatch(/below rep_min/);
  });

  it("restricts progression rules to what the day or movement can use", () => {
    expect(
      reasons([{ type: "set_progression", day_index: 0, exercise: null, progression: "time", rationale: "r" }]),
    ).toMatch(/A day's rule must be one of/);
    expect(
      reasons([{ type: "set_progression", day_index: 1, exercise: "plank", progression: "linear", rationale: "r" }]),
    ).toMatch(/its rule must be one of time, off/);

    const ok = validateChanges(
      [{ type: "set_progression", day_index: 3, exercise: null, progression: "linear", rationale: "r" }],
      baseWeek(),
      context,
    );
    if (!ok.ok) throw new Error(ok.errors.join());
    expect(ok.value[0]).toMatchObject({ before: "Double progression", after: "Linear progression" });
  });

  it("joins a superset only where a partner already is", () => {
    expect(
      reasons([{ type: "set_superset", day_index: 1, exercise: "barbell-squat", superset: 3, rationale: "r" }]),
    ).toMatch(/needs a partner/);
    const ok = validateChanges(
      [{ type: "set_superset", day_index: 0, exercise: "bent-over-barbell-row", superset: 1, rationale: "r" }],
      baseWeek(),
      context,
    );
    if (!ok.ok) throw new Error(ok.errors.join());
    expect(ok.value[0]!.after).toBe("Superset 1 with Side Lateral Raise, Triceps Pushdown");
  });

  it("refuses an addition anchored to an exercise another change removes", () => {
    expect(
      reasons([
        { type: "remove_exercise", day_index: 0, exercise: "triceps-pushdown", rationale: "r" },
        {
          type: "add_exercise", day_index: 0, exercise: "face-pull", after_exercise: "triceps-pushdown",
          sets: 3, rep_min: 12, rep_max: 15, target_seconds: null, per_side: false, superset: null, why: "w", rationale: "r",
        },
      ]),
    ).toMatch(/which another change removes/);
  });

  it("shows loads in the person's units", () => {
    const result = validateChanges(
      [{ type: "set_load", day_index: 1, exercise: "barbell-squat", load_kg: 102.5, rationale: "r" }],
      baseWeek(),
      { ...context, units: "imperial" },
    );
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.value[0]).toMatchObject({ before: "220.46 lb", after: "225.97 lb" });
  });
});

describe("applyChanges", () => {
  it("applies exactly the ticked subset", () => {
    const [, sets] = recorded();
    const week = applyChanges(baseWeek(), [sets!], CATALOG);
    const before = baseWeek();
    expect(week.days[0]!.exercises.find((e) => e.exercise_id === bySlug("side-lateral-raise").id)!.target_sets).toBe(4);
    // Nothing else moved.
    week.days[0]!.exercises.find((e) => e.exercise_id === bySlug("side-lateral-raise").id)!.target_sets = 3;
    expect(week.days).toEqual(before.days);
  });

  it("swaps the movement in place, keeping sets and reps, dropping the old load", () => {
    const base = baseWeek();
    base.days[4]!.exercises[0]!.target_weight_kg = 20;
    const week = applyChanges(
      base,
      [{ type: "swap_exercise", day_index: 4, exercise: "bulgarian-split-squat", to_exercise: "dumbbell-lunges", why: "Easier setup.", rationale: "r" }],
      CATALOG,
    );
    expect(week.days[4]!.exercises[0]).toMatchObject({
      exercise_id: bySlug("dumbbell-lunges").id,
      target_sets: 3,
      rep_min: 8,
      rep_max: 10,
      target_weight_kg: null,
      note: "Easier setup.",
    });
  });

  it("adds after the anchor, turning a rest day into a training day", () => {
    const week = applyChanges(
      baseWeek(),
      [
        {
          type: "add_exercise", day_index: 0, exercise: "face-pull", after_exercise: "bent-over-barbell-row",
          sets: 3, rep_min: 12, rep_max: 15, target_seconds: null, per_side: false, superset: null, why: "Rear delts.", rationale: "r",
        },
        {
          type: "add_exercise", day_index: 2, exercise: "running-treadmill", after_exercise: null,
          sets: 1, rep_min: null, rep_max: null, target_seconds: 1200, per_side: false, superset: null, why: "Easy cardio.", rationale: "r",
        },
      ],
      CATALOG,
    );
    expect(week.days[0]!.exercises.map((e) => e.exercise_id).indexOf(bySlug("face-pull").id)).toBe(2);
    expect(week.days[0]!.exercises.map((e) => e.position)).toEqual([0, 1, 2, 3, 4]);
    expect(week.days[2]).toMatchObject({ is_rest: false });
    expect(week.days[2]!.exercises[0]).toMatchObject({ target_seconds: 1200, rep_min: null });
  });

  it("makes a day that loses its last exercise a rest day, and the week a draft", () => {
    const base = baseWeek();
    const week = applyChanges(
      base,
      ["bulgarian-split-squat", "lying-leg-curls", "standing-calf-raises"].map(
        (exercise): Change => ({ type: "remove_exercise", day_index: 4, exercise, rationale: "r" }),
      ),
      CATALOG,
    );
    expect(week.days[4]).toMatchObject({ is_rest: true, exercises: [] });
    expect(week.week?.status).toBe("draft");
  });

  it("renames a day and sets its rule", () => {
    const week = applyChanges(
      baseWeek(),
      [
        { type: "rename_day", day_index: 3, name: "Upper B · volume", focus_note: null, rationale: "r" },
        { type: "set_progression", day_index: 3, exercise: null, progression: "linear", rationale: "r" },
      ],
      CATALOG,
    );
    expect(week.days[3]).toMatchObject({ name: "Upper B · volume", focus_note: null, progression: "linear" });
  });

  it("does not mutate the week it was given", () => {
    const base = baseWeek();
    const copy = structuredClone(base);
    applyChanges(base, recorded(), CATALOG);
    expect(base).toEqual(copy);
  });
});
