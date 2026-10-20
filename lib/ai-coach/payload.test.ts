import { describe, expect, it } from "vitest";
import { addDays, format, parseISO } from "date-fns";
import {
  ageOn,
  buildCatalog,
  buildReviewPayload,
  catalogText,
  planForModel,
  sessionsSinceProgress,
  type ReviewInput,
  type ReviewPlannedDay,
  type ReviewSession,
  type ReviewSet,
} from "./payload";
import type { WeekSnapshot } from "./schemas";
import { CATALOG, DAY_LABELS, bySlug } from "./__fixtures__/catalog";

const BENCH = bySlug("barbell-bench-press-medium-grip");
const RAISE = bySlug("side-lateral-raise");
const SQUAT = bySlug("barbell-squat");
const PLANK = bySlug("plank");

const uid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const WEEKS = ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"];

/** Monday: bench 3×5 and raises 3×12–15. Wednesday: squat 3×5. Every week. */
function plannedDays(): ReviewPlannedDay[] {
  return WEEKS.flatMap((week_start, w) => [
    {
      id: uid(100 + w * 10),
      week_start,
      day_index: 0,
      is_rest: false,
      exercises: [
        { exercise_id: BENCH.id, target_sets: 3, rep_min: 5, rep_max: 5, target_seconds: null },
        { exercise_id: RAISE.id, target_sets: 3, rep_min: 12, rep_max: 15, target_seconds: null },
      ],
    },
    {
      id: uid(101 + w * 10),
      week_start,
      day_index: 2,
      is_rest: false,
      exercises: [{ exercise_id: SQUAT.id, target_sets: 3, rep_min: 5, rep_max: 5, target_seconds: null }],
    },
    { id: uid(102 + w * 10), week_start, day_index: 1, is_rest: true, exercises: [] },
  ]);
}

const dayId = (weekStart: string, index: 0 | 2) => uid(100 + WEEKS.indexOf(weekStart) * 10 + (index === 0 ? 0 : 1));

function session(
  n: number,
  date: string,
  day: string | null,
  minutes: number | null,
  sets: Omit<ReviewSet, "session_id" | "set_index" | "is_complete">[][],
  extra: Partial<ReviewSession> = {},
): { session: ReviewSession; sets: ReviewSet[] } {
  const id = uid(n);
  const started = `${date}T18:00:00.000Z`;
  return {
    session: {
      id,
      day_id: day,
      started_at: started,
      ended_at: minutes == null ? null : new Date(Date.parse(started) + minutes * 60000).toISOString(),
      rating: null,
      notes: null,
      ...extra,
    },
    sets: sets.flatMap((group) =>
      group.map((set, i) => ({ ...set, session_id: id, set_index: i, is_complete: true })),
    ),
  };
}

const lift = (exercise: { id: string }, kg: number, reps: number[], rpe: number | null = null) =>
  reps.map((r) => ({ exercise_id: exercise.id, weight_kg: kg, reps: r, rpe, duration_s: null }));
const hold = (seconds: number[]) =>
  seconds.map((s) => ({ exercise_id: PLANK.id, weight_kg: null, reps: null, rpe: null, duration_s: s }));

function input(): ReviewInput {
  const logged = [
    // Before the window: ignored.
    session(1, "2026-09-21", dayId("2026-09-21", 0), 60, [lift(BENCH, 77.5, [5, 5, 5], 7)]),
    session(2, "2026-09-28", dayId("2026-09-28", 0), 60, [lift(BENCH, 80, [5, 5, 5], 8), lift(RAISE, 10, [16, 16, 16])], {
      rating: 1,
    }),
    session(3, "2026-09-30", dayId("2026-09-28", 2), 75, [lift(SQUAT, 100, [5, 5, 5])]),
    session(4, "2026-10-05", dayId("2026-10-05", 0), 60, [lift(BENCH, 82.5, [5, 5, 4], 9), lift(RAISE, 10, [16, 16, 16])]),
    session(5, "2026-10-12", dayId("2026-10-12", 0), 300, [lift(BENCH, 82.5, [5, 4, 4], 9.5), lift(RAISE, 10, [16, 16, 16])], {
      rating: 2,
    }),
    session(6, "2026-10-14", dayId("2026-10-12", 2), 55, [lift(SQUAT, 105, [5, 5, 5])]),
    // Off plan: no day.
    session(7, "2026-10-14", null, 15, [hold([60, 60])]),
    session(8, "2026-10-19", dayId("2026-10-19", 0), 62, [lift(BENCH, 80, [5, 5], 9.5)], {
      rating: 3,
      notes: `Shoulder felt tight. ${"x".repeat(400)}`,
    }),
    // Still open: ignored.
    session(9, "2026-10-20", dayId("2026-10-19", 0), null, [lift(BENCH, 80, [5])]),
  ];

  const base: WeekSnapshot = {
    week: { id: uid(900), label: "Push / Legs", status: "published", notes: null },
    days: [
      {
        id: dayId("2026-10-19", 0), day_index: 0, name: "Push", focus_note: null, is_rest: false, progression: "linear",
        exercises: [
          { id: uid(901), exercise_id: BENCH.id, position: 0, target_sets: 3, rep_min: 5, rep_max: 5, per_side: false, note: null, target_weight_kg: 82.5, superset_group: null, target_seconds: null, progression: null, increment_kg: null },
          { id: uid(902), exercise_id: RAISE.id, position: 1, target_sets: 3, rep_min: 12, rep_max: 15, per_side: false, note: null, target_weight_kg: null, superset_group: null, target_seconds: null, progression: "double", increment_kg: null },
        ],
      },
    ],
  };

  return {
    today: "2026-10-20",
    base,
    baseWeekStart: "2026-10-19",
    dayLabels: DAY_LABELS,
    catalog: CATALOG,
    sessions: logged.map((l) => l.session),
    plannedDays: plannedDays(),
    sets: logged.flatMap((l) => l.sets),
    bodyweights: [
      { measured_on: "2026-09-10", weight_kg: 82 },
      { measured_on: "2026-09-25", weight_kg: 81.5 },
      { measured_on: "2026-10-10", weight_kg: 80.8 },
      { measured_on: "2026-10-18", weight_kg: 80.2 },
    ],
    goalWeightKg: 78,
    sessionMinutes: 60,
    rejected: [
      {
        type: "set_sets",
        target_text: "Mon · Push — Side Lateral Raise",
        before_text: "3 sets",
        after_text: "4 sets",
        decided_at: "2026-10-01T10:00:00.000Z",
      },
    ],
  };
}

describe("buildReviewPayload", () => {
  const payload = buildReviewPayload(input());
  const bench = payload.exercises.find((e) => e.slug === BENCH.slug)!;

  it("covers four weeks ending today", () => {
    expect(payload.window).toEqual({ from: "2026-09-23", to: "2026-10-20", days: 28 });
  });

  it("scores sets against the day each session followed", () => {
    expect(bench).toMatchObject({
      sessions: 4,
      planned_sets: 12,
      completed_sets: 11,
      sets_hit: 8,
      sets_missed: 3,
      sets_skipped: 1,
      sets_above_range: 0,
    });
    const raise = payload.exercises.find((e) => e.slug === RAISE.slug)!;
    expect(raise).toMatchObject({ sets_hit: 9, sets_missed: 0, sets_above_range: 9 });
  });

  it("reads effort as a trend, not a single number", () => {
    expect(bench).toMatchObject({ avg_rpe: 9, rpe_early: 8.5, rpe_late: 9.5 });
    expect(payload.effort_by_week.map((w) => w.week_start)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("counts sessions since a lift last improved", () => {
    expect(bench.sessions_since_progress).toBe(2);
    expect(payload.exercises.find((e) => e.slug === SQUAT.slug)!.sessions_since_progress).toBe(0);
  });

  it("measures adherence against planned days that have already happened", () => {
    expect(payload.adherence).toMatchObject({
      planned_training_days: 8,
      sessions_completed: 7,
      sessions_on_plan: 6,
      sessions_off_plan: 1,
      planned_days_missed: 2,
    });
  });

  it("compares session length with the intake, ignoring sessions left open for hours", () => {
    expect(payload.duration).toEqual({
      target_minutes: 60,
      sessions_timed: 6,
      average_minutes: 55,
      longest_minutes: 75,
      sessions_over_target: 1,
    });
  });

  it("tallies ratings", () => {
    expect(payload.ratings).toEqual({ too_easy: 1, about_right: 1, brutal: 1, unrated: 4 });
  });

  it("reads body weight against the goal, from the last weigh-in before the window", () => {
    expect(payload.bodyweight).toEqual({
      goal_kg: 78,
      entries: 3,
      first: { date: "2026-09-10", kg: 82 },
      last: { date: "2026-10-18", kg: 80.2 },
      change_kg: -1.8,
      per_week_kg: -0.3,
      moving_toward_goal: true,
    });
  });

  it("finds major muscles that got no work at all, or only secondary work", () => {
    expect(payload.muscles.untrained).toEqual(["lats", "middle_back", "biceps", "calves"]);
    expect(payload.muscles.secondary_only).toEqual(["triceps", "hamstrings", "glutes"]);
    expect(payload.muscles.completed_sets_by_muscle).toEqual({ abdominals: 2, chest: 11, quadriceps: 6, shoulders: 9 });
  });

  it("keeps notes short and tagged with their day and rating", () => {
    expect(payload.notes).toHaveLength(1);
    expect(payload.notes[0]).toMatchObject({ date: "2026-10-19", day: "day 0", rating: "brutal" });
    expect(payload.notes[0]!.text.length).toBe(280);
  });

  it("passes on what was turned down before", () => {
    expect(payload.previously_rejected).toEqual([
      { type: "set_sets", target: "Mon · Push — Side Lateral Raise", before: "3 sets", after: "4 sets", decided_on: "2026-10-01" },
    ]);
  });

  it("names exercises by slug and never carries an id", () => {
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(payload.plan.days[0]!.exercises.map((e) => e.slug)).toEqual([BENCH.slug, RAISE.slug]);
  });

  it("shows the plan's effective rule per exercise", () => {
    const [benchRow, raiseRow] = payload.plan.days[0]!.exercises;
    expect(benchRow).toMatchObject({ rule: "linear", rule_is_override: false, reps: "5", load_kg: 82.5 });
    expect(raiseRow).toMatchObject({ rule: "double", rule_is_override: true, reps: "12-15" });
    expect(payload.plan.days[1]).toMatchObject({ weekday: "Tue", rest: true, exercises: [] });
  });

  it("is empty-handed, not wrong, with nothing logged", () => {
    const empty = buildReviewPayload({ ...input(), sessions: [], sets: [], bodyweights: [], goalWeightKg: null });
    expect(empty.exercises).toEqual([]);
    expect(empty.adherence.sessions_completed).toBe(0);
    expect(empty.bodyweight).toMatchObject({ first: null, change_kg: null, moving_toward_goal: null });
    expect(empty.muscles.untrained).toHaveLength(11);
  });
});

describe("sessionsSinceProgress", () => {
  it("needs two sessions to say anything", () => {
    expect(sessionsSinceProgress([100])).toBeNull();
  });
  it("counts the run since the last new best, ignoring rounding noise", () => {
    expect(sessionsSinceProgress([100, 105, 105.2, 104])).toBe(2);
    expect(sessionsSinceProgress([100, 101, 102])).toBe(0);
  });
});

describe("buildCatalog", () => {
  it("keeps the equipment the person has, plus bodyweight", () => {
    const catalog = buildCatalog(CATALOG, ["dumbbell"]);
    expect(new Set(catalog.map((e) => e.equipment))).toEqual(new Set(["dumbbell", "body_only"]));
  });
  it("leaves the long tail of the library out of the prompt", () => {
    const tail = { ...PLANK, id: "00000000-0000-4000-9000-000000000001", slug: "plate-pinch", offered: false };
    const catalog = buildCatalog([...CATALOG, tail]);
    expect(catalog.map((e) => e.slug)).not.toContain("plate-pinch");
    expect(catalog).toHaveLength(CATALOG.length);
  });
  it("renders one compact line per movement", () => {
    expect(catalogText([PLANK])).toBe("plank | Plank | abdominals | body_only | time");
  });
});

describe("planForModel", () => {
  it("fills a partial week with rest days and skips movements not in the library", () => {
    const plan = planForModel(input().base, CATALOG.filter((e) => e.id !== RAISE.id), DAY_LABELS);
    expect(plan.days).toHaveLength(7);
    expect(plan.days[0]!.exercises.map((e) => e.slug)).toEqual([BENCH.slug]);
  });
});

describe("ageOn", () => {
  it("counts birthdays, and refuses nonsense", () => {
    expect(ageOn("1990-10-21", "2026-10-20")).toBe(35);
    expect(ageOn("1990-10-20", "2026-10-20")).toBe(36);
    expect(ageOn(null, "2026-10-20")).toBeNull();
  });
});

// Keeps the date helpers honest about the window maths used above.
it("the window starts 27 days before today", () => {
  expect(format(addDays(parseISO("2026-10-20"), -27), "yyyy-MM-dd")).toBe("2026-09-23");
});
