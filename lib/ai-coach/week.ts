/**
 * Weeks as plain data: reading one out of rows, comparing two, and working out
 * the writes that turn the week in the database into a target week.
 *
 * Pure. lib/ai-coach/writer.ts runs the writes; everything that decides what
 * they are lives here so it can be tested without a database.
 *
 * Two rules shape the writes:
 *
 * - Days are matched by position (day_index) and updated in place. A logged
 *   session points at its day's id, so replacing day rows would cut sessions
 *   loose from the plan they followed — and the log must not change.
 * - Exercises are replaced wholesale. Nothing points at a program_exercises
 *   row, and a snapshot's rows go back in under their original ids, so a
 *   revert restores the very rows an apply removed.
 */

import type { DayProgression, ProgressionPolicy, WeekStatus } from "@/lib/database.types";
import type { SnapshotDay, SnapshotExercise, WeekSnapshot } from "./schemas";

// -------------------------------------------------------------- from rows

export type WeekRow = { id: string; label: string; status: WeekStatus; notes: string | null };

export type DayRow = {
  id: string;
  day_index: number;
  name: string;
  focus_note: string | null;
  is_rest: boolean;
  progression: DayProgression | null;
};

export type ExerciseRow = {
  id: string;
  day_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  rep_min: number | null;
  rep_max: number | null;
  per_side: boolean;
  note: string | null;
  target_weight_kg: number | string | null;
  superset_group: number | null;
  target_seconds: number | null;
  progression: ProgressionPolicy | null;
  increment_kg: number | string | null;
};

const num = (value: number | string | null | undefined) =>
  value == null || value === "" ? null : Number(value);

/** A week, ordered by day and position, exactly as the rows have it. */
export function snapshotFromRows(
  week: WeekRow | null,
  days: DayRow[],
  exercises: ExerciseRow[],
): WeekSnapshot {
  if (!week) return { week: null, days: [] };

  const byDay = new Map<string, SnapshotExercise[]>();
  for (const row of exercises) {
    const list = byDay.get(row.day_id) ?? [];
    list.push({
      id: row.id,
      exercise_id: row.exercise_id,
      position: row.position,
      target_sets: row.target_sets,
      rep_min: row.rep_min,
      rep_max: row.rep_max,
      per_side: row.per_side,
      note: row.note,
      target_weight_kg: num(row.target_weight_kg),
      superset_group: row.superset_group,
      target_seconds: row.target_seconds,
      progression: row.progression,
      increment_kg: num(row.increment_kg),
    });
    byDay.set(row.day_id, list);
  }

  return {
    week: { id: week.id, label: week.label, status: week.status, notes: week.notes },
    days: [...days]
      .sort((a, b) => a.day_index - b.day_index)
      .map((day) => ({
        id: day.id,
        day_index: day.day_index,
        name: day.name,
        focus_note: day.focus_note,
        is_rest: day.is_rest,
        progression: day.progression ?? "double",
        exercises: (byDay.get(day.id) ?? []).sort((a, b) => a.position - b.position),
      })),
  };
}

// ----------------------------------------------------------- inspecting

export function weekHasContent(week: WeekSnapshot): boolean {
  return week.days.some((day) => day.exercises.length > 0);
}

export function exerciseCount(week: WeekSnapshot): number {
  return week.days.reduce((n, day) => n + day.exercises.length, 0);
}

/**
 * What a week prescribes, without ids. Two weeks with the same fingerprint
 * train the same way; a review checks it to notice a plan edited since.
 */
export function weekFingerprint(week: WeekSnapshot): string {
  const content = week.days.map((day) => [
    day.day_index,
    day.name,
    day.is_rest,
    day.progression,
    day.exercises.map((e) => [
      e.exercise_id,
      e.target_sets,
      e.rep_min,
      e.rep_max,
      e.target_seconds,
      e.target_weight_kg,
      e.superset_group,
      e.progression,
    ]),
  ]);
  return hash(JSON.stringify(content));
}

/** FNV-1a, 32-bit. Detects edits; it is not a security boundary. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Renumbers positions 0..n per day, as the session screen orders them. */
export function normalisePositions(week: WeekSnapshot): WeekSnapshot {
  return {
    ...week,
    days: week.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((e, position) => ({ ...e, position })),
    })),
  };
}

// --------------------------------------------------------------- writing

type DayFields = Pick<SnapshotDay, "name" | "focus_note" | "is_rest" | "progression">;

export type WeekWriteOps = {
  /** create: insert the week row; update: rewrite its fields; delete: remove it. */
  week:
    | { action: "create"; fields: { label: string; status: WeekStatus; notes: string | null } }
    | { action: "update"; id: string; fields: { label: string; status: WeekStatus; notes: string | null } }
    | { action: "delete"; id: string }
    | { action: "none" };
  /** Every exercise row currently in the week. */
  deleteExerciseIds: string[];
  updateDays: { id: string; fields: DayFields }[];
  insertDays: (DayFields & { day_index: number })[];
  /** Days the target does not have and nothing was logged against. */
  deleteDayIds: string[];
  /** Days the target does not have but a session followed: emptied, kept. */
  restDayIds: string[];
  /** Keyed by day_index; the writer resolves the day's id once days exist. */
  insertExercises: { day_index: number; row: SnapshotExercise }[];
};

export const EMPTY_REST_DAY: DayFields = {
  name: "Rest",
  focus_note: null,
  is_rest: true,
  progression: "double",
};

/**
 * The writes that make `current` (read from the database, ids and all) into
 * `target`. A target with `week: null` means "there should be no week": it is
 * removed outright unless a session was logged against one of its days, in
 * which case its days are emptied and kept, and the week stays as a draft.
 */
export function planWeekWrite(
  current: WeekSnapshot,
  target: WeekSnapshot,
  sessionDayIds: ReadonlySet<string>,
): WeekWriteOps {
  const ops: WeekWriteOps = {
    week: { action: "none" },
    deleteExerciseIds: current.days.flatMap((d) => d.exercises.flatMap((e) => (e.id ? [e.id] : []))),
    updateDays: [],
    insertDays: [],
    deleteDayIds: [],
    restDayIds: [],
    insertExercises: [],
  };

  const currentWeek = current.week;

  if (target.week === null) {
    if (!currentWeek?.id) return ops;
    const logged = current.days.filter((d) => d.id && sessionDayIds.has(d.id));
    if (logged.length === 0) {
      ops.week = { action: "delete", id: currentWeek.id };
      // Days and exercises go with the week (on delete cascade).
      ops.deleteExerciseIds = [];
      return ops;
    }
    for (const day of current.days) {
      if (!day.id) continue;
      if (sessionDayIds.has(day.id)) ops.restDayIds.push(day.id);
      else ops.deleteDayIds.push(day.id);
    }
    ops.week = {
      action: "update",
      id: currentWeek.id!,
      fields: { label: currentWeek.label, status: "draft", notes: currentWeek.notes },
    };
    return ops;
  }

  const fields = { label: target.week.label, status: target.week.status, notes: target.week.notes };
  ops.week = currentWeek?.id
    ? { action: "update", id: currentWeek.id, fields }
    : { action: "create", fields };

  const currentByIndex = new Map(current.days.map((d) => [d.day_index, d]));
  const targetIndexes = new Set(target.days.map((d) => d.day_index));

  for (const day of target.days) {
    const dayFields: DayFields = {
      name: day.name,
      focus_note: day.focus_note,
      is_rest: day.is_rest,
      progression: day.progression,
    };
    const existing = currentByIndex.get(day.day_index);
    if (existing?.id) ops.updateDays.push({ id: existing.id, fields: dayFields });
    else ops.insertDays.push({ day_index: day.day_index, ...dayFields });

    day.exercises.forEach((exercise, position) => {
      ops.insertExercises.push({ day_index: day.day_index, row: { ...exercise, position } });
    });
  }

  for (const day of current.days) {
    if (!day.id || targetIndexes.has(day.day_index)) continue;
    if (sessionDayIds.has(day.id)) ops.restDayIds.push(day.id);
    else ops.deleteDayIds.push(day.id);
  }

  return ops;
}

/**
 * The week a target becomes once written: what Revert will compare against
 * and what tests check round-trips with. `restDayIds` are part of it because
 * those days stay in the database.
 */
export function stripIds(week: WeekSnapshot): WeekSnapshot {
  return {
    week: week.week ? { ...week.week, id: null } : null,
    days: week.days.map((day) => ({
      ...day,
      id: null,
      exercises: day.exercises.map((e) => ({ ...e, id: null })),
    })),
  };
}

/** Seven days, filling any gaps with rest days, the way a week is always shown. */
export function fillWeek(days: SnapshotDay[]): SnapshotDay[] {
  const byIndex = new Map(days.map((d) => [d.day_index, d]));
  return Array.from({ length: 7 }, (_, day_index) => {
    return (
      byIndex.get(day_index) ?? {
        id: null,
        day_index,
        ...EMPTY_REST_DAY,
        exercises: [],
      }
    );
  });
}
