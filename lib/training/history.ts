/**
 * Workout history a month at a time: which month and day the URL asks for, the
 * calendar grid, each session's line in the list, and how many records each
 * one set. Pure functions, unit-tested; the queries live in history-queries.ts.
 *
 * Sessions are filed under the day they started on, read in the server's local
 * time — the same rule the Progress heatmap uses, so a day picked there opens
 * the same day here.
 */

import { addDays, addMonths, format, isValid, parseISO, startOfWeek } from "date-fns";
import { toDateString, type WeekStartDay } from "@/lib/dates";
import type { Tracking } from "@/lib/database.types";
import { sessionMinutes } from "./activity";
import { bestSet, totalVolume } from "./e1rm";
import { sessionRecords, type FinishedExercise, type PreviousBest } from "./records";

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10" for any moment in October 2026, in local time. */
export function monthOf(date: Date): string {
  return format(date, "yyyy-MM");
}

/** A yyyy-MM-dd that names a real calendar day, or null. */
function readDay(raw: unknown): string | null {
  if (typeof raw !== "string" || !DAY.test(raw)) return null;
  const date = parseISO(raw);
  // parseISO rolls 2026-02-31 over into March; a real day survives the round trip.
  return isValid(date) && toDateString(date) === raw ? raw : null;
}

/**
 * The month and day a /history URL asks for.
 *
 * A bad or missing month falls back to the day's month, then to this one, and
 * a future month is pulled back to this one — there is nothing to show there.
 * The day only counts when it falls inside the month shown, so a stale link
 * never highlights a day that is not on screen.
 */
export function readHistoryParams(
  params: { month?: string | string[]; day?: string | string[] },
  today = new Date(),
): { month: string; day: string | null } {
  const day = readDay(params.day);
  const current = monthOf(today);
  let month = typeof params.month === "string" && MONTH.test(params.month) ? params.month : null;
  month ??= day ? day.slice(0, 7) : current;
  if (month > current) month = current;
  return { month, day: day && day.startsWith(month) ? day : null };
}

/** Local midnight on the 1st, and on the 1st of the month after. */
export function monthRange(month: string): { start: Date; end: Date } {
  const start = parseISO(`${month}-01`);
  return { start, end: addMonths(start, 1) };
}

export function shiftMonth(month: string, by: number): string {
  return monthOf(addMonths(parseISO(`${month}-01`), by));
}

/** "October 2026". */
export function monthLabel(month: string): string {
  return format(parseISO(`${month}-01`), "MMMM yyyy");
}

/** The day a session belongs to: the one it started on. */
export function sessionDay(startedAt: string): string {
  return toDateString(parseISO(startedAt));
}

export type CalendarDay = {
  date: string;
  /** 1–31, for the cell. */
  dayOfMonth: number;
  /** Finished sessions that started this day. */
  sessions: number;
  isToday: boolean;
  isFuture: boolean;
};

/**
 * The month as rows of seven, starting on the lifter's own first weekday.
 * Days of the neighbouring months are null: the grid marks this month's
 * training only, and a faded 31st from last month reads as part of it.
 */
export function buildMonthGrid({
  month,
  weekStartsOn,
  counts,
  today = new Date(),
}: {
  month: string;
  weekStartsOn: WeekStartDay;
  /** Sessions per yyyy-MM-dd. */
  counts: ReadonlyMap<string, number>;
  today?: Date;
}): (CalendarDay | null)[][] {
  const { start, end } = monthRange(month);
  const todayKey = toDateString(today);
  const weeks: (CalendarDay | null)[][] = [];
  for (let cursor = startOfWeek(start, { weekStartsOn }); cursor < end; ) {
    const week: (CalendarDay | null)[] = [];
    for (let i = 0; i < 7; i++, cursor = addDays(cursor, 1)) {
      if (cursor < start || cursor >= end) {
        week.push(null);
        continue;
      }
      const date = toDateString(cursor);
      week.push({
        date,
        dayOfMonth: cursor.getDate(),
        sessions: counts.get(date) ?? 0,
        isToday: date === todayKey,
        isFuture: date > todayKey,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

export type MonthSession = {
  id: string;
  title: string | null;
  startedAt: string;
  endedAt: string;
};

/** One completed set, with how its movement is logged. */
export type MonthSet = {
  sessionId: string;
  exerciseId: string;
  tracking: Tracking;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
};

export type SessionLine = {
  id: string;
  title: string | null;
  date: string;
  startedAt: string;
  /** Null when the session has no believable length (see sessionMinutes). */
  minutes: number | null;
  sets: number;
  exercises: number;
  /** Weight × reps over weight-and-reps movements only, as on the summary. */
  volumeKg: number;
};

export type HistoryDay = { date: string; sessions: SessionLine[] };

/**
 * The month's sessions as days, newest day first, and within a day in the
 * order they happened — so a morning run reads above the evening's lifting.
 */
export function groupSessions(sessions: MonthSession[], sets: MonthSet[]): HistoryDay[] {
  const bySession = new Map<string, MonthSet[]>();
  for (const set of sets) {
    const list = bySession.get(set.sessionId) ?? [];
    list.push(set);
    bySession.set(set.sessionId, list);
  }

  const byDay = new Map<string, SessionLine[]>();
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const session of ordered) {
    const logged = bySession.get(session.id) ?? [];
    const date = sessionDay(session.startedAt);
    const list = byDay.get(date) ?? [];
    list.push({
      id: session.id,
      title: session.title,
      date,
      startedAt: session.startedAt,
      minutes: sessionMinutes(session.startedAt, session.endedAt),
      sets: logged.length,
      exercises: new Set(logged.map((s) => s.exerciseId)).size,
      volumeKg: totalVolume(
        logged
          .filter((s) => s.tracking === "reps")
          .map((s) => ({ weight_kg: s.weightKg, reps: s.reps })),
      ),
    });
    byDay.set(date, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({ date, sessions: list }));
}

export type MonthTotals = { sessions: number; days: number; minutes: number; volumeKg: number };

export function monthTotals(days: HistoryDay[]): MonthTotals {
  const lines = days.flatMap((d) => d.sessions);
  return {
    sessions: lines.length,
    days: days.length,
    minutes: lines.reduce((n, s) => n + (s.minutes ?? 0), 0),
    volumeKg: lines.reduce((n, s) => n + s.volumeKg, 0),
  };
}

/** "48 min", "1 h 05 min". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const m = minutes % 60;
  return m === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${String(m).padStart(2, "0")} min`;
}

type BestInput = Pick<MonthSet, "exerciseId" | "weightKg" | "reps" | "durationS">;

/**
 * Folds sets into running all-time bests, in place — the same three numbers
 * getPersonalBests reads (best set, heaviest bar, longest hold), so a record
 * here is a record on the summary page.
 */
export function foldBests(bests: Map<string, PreviousBest>, sets: readonly BestInput[]): void {
  const byExercise = new Map<string, BestInput[]>();
  for (const set of sets) {
    const list = byExercise.get(set.exerciseId) ?? [];
    list.push(set);
    byExercise.set(set.exerciseId, list);
  }
  for (const [id, list] of byExercise) {
    const before = bests.get(id);
    const candidates = list.map((s) => ({ weight_kg: s.weightKg, reps: s.reps }));
    // The best of everything is the best of (the best so far, plus these), so
    // carrying one set forward is enough.
    if (before?.bestSet) candidates.unshift(before.bestSet);
    const top = bestSet(candidates);
    bests.set(id, {
      bestSet: top ? { weight_kg: top.weight_kg, reps: top.reps } : null,
      heaviestKg: Math.max(before?.heaviestKg ?? 0, ...list.map((s) => Number(s.weightKg ?? 0))),
      longestS: Math.max(before?.longestS ?? 0, ...list.map((s) => s.durationS ?? 0)),
    });
  }
}

export type RecordSession = { id: string; startedAt: string; sets: MonthSet[] };

/**
 * How many records each session set, judged against everything that started
 * before it — never against later sessions, so an old PR stays a PR after you
 * beat it. Sessions are walked oldest first, carrying the bests forward.
 */
export function recordCounts(sessions: RecordSession[]): Map<string, number> {
  const counts = new Map<string, number>();
  const bests = new Map<string, PreviousBest>();
  const ordered = [...sessions].sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
  );
  for (const session of ordered) {
    const byExercise = new Map<string, FinishedExercise>();
    for (const set of session.sets) {
      const entry =
        byExercise.get(set.exerciseId) ??
        { id: set.exerciseId, name: "", tracking: set.tracking, sets: [] };
      entry.sets.push({ weight_kg: set.weightKg, reps: set.reps, duration_s: set.durationS });
      byExercise.set(set.exerciseId, entry);
    }
    counts.set(session.id, sessionRecords([...byExercise.values()], bests).length);
    foldBests(bests, session.sets);
  }
  return counts;
}
