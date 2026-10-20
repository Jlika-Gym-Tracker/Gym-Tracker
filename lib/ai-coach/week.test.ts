import { describe, expect, it } from "vitest";
import type { WeekSnapshot } from "./schemas";
import {
  EMPTY_REST_DAY,
  planWeekWrite,
  snapshotFromRows,
  stripIds,
  weekFingerprint,
  weekHasContent,
  type DayRow,
  type ExerciseRow,
  type WeekRow,
  type WeekWriteOps,
} from "./week";
import { applyChanges } from "./changes";
import { planToWeek, validatePlan } from "./plan";
import { planOutputSchema } from "./schemas";
import { PLAN_REPLY } from "./__fixtures__/recorded";
import { CATALOG, bySlug } from "./__fixtures__/catalog";

/**
 * A tiny in-memory stand-in for the three program tables and the sessions
 * that point at days, executing ops the way lib/ai-coach/writer.ts does —
 * including what Postgres would do on delete (cascade to exercises, set null
 * on sessions) so a test notices if a write would disturb the log.
 */
type Db = {
  week: WeekRow | null;
  days: DayRow[];
  exercises: ExerciseRow[];
  sessions: { id: string; day_id: string | null }[];
  next: number;
};

function execute(db: Db, ops: WeekWriteOps) {
  const id = (prefix: string) => `${prefix}-new-${db.next++}`;
  const dropDays = (ids: string[]) => {
    db.exercises = db.exercises.filter((e) => !ids.includes(e.day_id));
    db.days = db.days.filter((d) => !ids.includes(d.id));
    for (const s of db.sessions) if (s.day_id && ids.includes(s.day_id)) s.day_id = null;
  };

  switch (ops.week.action) {
    case "create":
      db.week = { id: id("week"), ...ops.week.fields };
      break;
    case "update":
      db.week = { ...db.week!, ...ops.week.fields };
      break;
    case "delete":
      dropDays(db.days.map((d) => d.id));
      db.week = null;
      return;
    case "none":
      return;
  }

  db.exercises = db.exercises.filter((e) => !ops.deleteExerciseIds.includes(e.id));
  for (const update of ops.updateDays) {
    const day = db.days.find((d) => d.id === update.id)!;
    Object.assign(day, update.fields);
  }
  for (const insert of ops.insertDays) {
    if (db.days.some((d) => d.day_index === insert.day_index)) throw new Error("unique (week_id, day_index)");
    db.days.push({ id: id("day"), ...insert });
  }
  for (const dayId of ops.restDayIds) Object.assign(db.days.find((d) => d.id === dayId)!, EMPTY_REST_DAY);
  dropDays(ops.deleteDayIds);
  for (const { day_index, row } of ops.insertExercises) {
    const day = db.days.find((d) => d.day_index === day_index)!;
    if (row.id && db.exercises.some((e) => e.id === row.id)) throw new Error("duplicate exercise id");
    db.exercises.push({ ...row, id: row.id ?? id("ex"), day_id: day.id });
  }
}

const read = (db: Db) => snapshotFromRows(db.week, db.days, db.exercises);

function write(db: Db, target: WeekSnapshot) {
  const logged = new Set(db.sessions.map((s) => s.day_id).filter((d): d is string => !!d));
  execute(db, planWeekWrite(read(db), target, logged));
}

function seededDb(): Db {
  const bench = bySlug("barbell-bench-press-medium-grip");
  const squat = bySlug("barbell-squat");
  return {
    week: { id: "week-1", label: "My week", status: "published", notes: "deload after this" },
    days: Array.from({ length: 7 }, (_, i) => ({
      id: `day-${i}`,
      day_index: i,
      name: i === 0 ? "Push" : i === 2 ? "Legs" : "Rest",
      focus_note: i === 0 ? "Chest first" : null,
      is_rest: i !== 0 && i !== 2,
      progression: i === 2 ? "linear" : "double",
    })),
    exercises: [
      {
        id: "ex-1", day_id: "day-0", exercise_id: bench.id, position: 0, target_sets: 3, rep_min: 8, rep_max: 12,
        per_side: false, note: "my own note", target_weight_kg: "62.50", superset_group: null, target_seconds: null,
        progression: null, increment_kg: null,
      },
      {
        id: "ex-2", day_id: "day-2", exercise_id: squat.id, position: 0, target_sets: 5, rep_min: 5, rep_max: 5,
        per_side: false, note: null, target_weight_kg: 100, superset_group: null, target_seconds: null,
        progression: "linear", increment_kg: "5",
      },
    ],
    // A session was logged against Monday's day; that link must survive.
    sessions: [{ id: "session-1", day_id: "day-0" }],
    next: 1,
  };
}

function planTarget(current: WeekSnapshot) {
  const result = validatePlan(planOutputSchema.parse(JSON.parse(PLAN_REPLY)), CATALOG, { daysPerWeek: 4 });
  if (!result.ok) throw new Error(result.errors.join());
  return planToWeek(result.value, current);
}

describe("snapshotFromRows", () => {
  it("orders days and exercises and reads numeric strings as numbers", () => {
    const db = seededDb();
    db.days.reverse();
    const week = read(db);
    expect(week.days.map((d) => d.day_index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week.days[0]!.exercises[0]!.target_weight_kg).toBe(62.5);
    expect(week.days[2]!.exercises[0]!.increment_kg).toBe(5);
  });

  it("is empty when there is no week", () => {
    expect(snapshotFromRows(null, [], [])).toEqual({ week: null, days: [] });
  });
});

describe("apply then revert", () => {
  it("puts back exactly the rows that were there, ids included", () => {
    const db = seededDb();
    const before = structuredClone(read(db));

    write(db, planTarget(before));
    const applied = read(db);
    expect(applied.week).toMatchObject({ id: "week-1", status: "draft", label: "Upper / Lower · 4 days" });
    expect(applied.days.flatMap((d) => d.exercises)).toHaveLength(13);

    write(db, before);
    expect(read(db)).toEqual(before);
  });

  it("updates days in place, so a logged session keeps its day", () => {
    const db = seededDb();
    const before = read(db);
    write(db, planTarget(before));
    expect(db.days.map((d) => d.id).sort()).toEqual(before.days.map((d) => d.id!).sort());
    expect(db.sessions).toEqual([{ id: "session-1", day_id: "day-0" }]);
    write(db, before);
    expect(db.sessions).toEqual([{ id: "session-1", day_id: "day-0" }]);
  });

  it("writes what the target says, whatever ids it gets", () => {
    const db = seededDb();
    const target = planTarget(read(db));
    write(db, target);
    expect(stripIds(read(db))).toEqual(stripIds(target));
  });

  it("round-trips a week that had only some days", () => {
    const db = seededDb();
    db.days = db.days.filter((d) => d.day_index <= 2);
    const before = structuredClone(read(db));
    write(db, planTarget(before));
    expect(read(db).days).toHaveLength(7);
    write(db, before);
    expect(read(db)).toEqual(before);
  });

  it("round-trips review changes applied to the same week", () => {
    const db = seededDb();
    const before = structuredClone(read(db));
    const changed = applyChanges(
      before,
      [{ type: "set_sets", day_index: 0, exercise: "barbell-bench-press-medium-grip", sets: 4, rationale: "r" }],
      CATALOG,
    );
    write(db, changed);
    expect(read(db).days[0]!.exercises[0]!.target_sets).toBe(4);
    write(db, before);
    expect(read(db)).toEqual(before);
  });
});

describe("reverting a week the AI Coach created", () => {
  it("removes it when nothing was logged against it", () => {
    const db: Db = { week: null, days: [], exercises: [], sessions: [], next: 1 };
    const before = read(db);
    write(db, planTarget(before));
    expect(read(db).week).not.toBeNull();
    write(db, before);
    expect(read(db)).toEqual({ week: null, days: [] });
  });

  it("keeps days a session followed, emptied, rather than touch the session", () => {
    const db: Db = { week: null, days: [], exercises: [], sessions: [], next: 1 };
    const before = read(db);
    write(db, planTarget(before));
    const monday = db.days.find((d) => d.day_index === 0)!;
    db.sessions.push({ id: "s", day_id: monday.id });

    write(db, before);
    const after = read(db);
    expect(after.week?.status).toBe("draft");
    expect(after.days).toEqual([{ id: monday.id, day_index: 0, ...EMPTY_REST_DAY, exercises: [] }]);
    expect(db.sessions).toEqual([{ id: "s", day_id: monday.id }]);
  });
});

describe("planWeekWrite", () => {
  it("does nothing to remove a week that does not exist", () => {
    const ops = planWeekWrite({ week: null, days: [] }, { week: null, days: [] }, new Set());
    expect(ops.week).toEqual({ action: "none" });
  });

  it("creates the week when the slot is empty", () => {
    const ops = planWeekWrite({ week: null, days: [] }, planTarget({ week: null, days: [] }), new Set());
    expect(ops.week.action).toBe("create");
    expect(ops.insertDays).toHaveLength(7);
    expect(ops.deleteExerciseIds).toEqual([]);
  });
});

describe("weekFingerprint", () => {
  it("ignores ids and notices a changed prescription", () => {
    const week = read(seededDb());
    expect(weekFingerprint(stripIds(week))).toBe(weekFingerprint(week));
    const edited = structuredClone(week);
    edited.days[0]!.exercises[0]!.target_sets = 4;
    expect(weekFingerprint(edited)).not.toBe(weekFingerprint(week));
  });
});

describe("weekHasContent", () => {
  it("is true only with exercises", () => {
    expect(weekHasContent(read(seededDb()))).toBe(true);
    expect(weekHasContent({ week: null, days: [] })).toBe(false);
  });
});
