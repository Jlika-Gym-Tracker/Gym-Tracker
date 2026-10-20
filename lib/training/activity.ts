/**
 * A year of training as a calendar grid: the data behind the activity heatmap
 * on Progress. Pure functions, unit-tested.
 *
 * Days are bucketed by the date a session started on, the way every other
 * screen counts sessions, so a late session that ends after midnight still
 * belongs to the day it began.
 */

import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { toDateString, WEEK_STARTS_ON, type WeekStartDay } from "@/lib/dates";

/** 53 columns: a full year plus the week it started in, like a contribution graph. */
export const ACTIVITY_WEEKS = 53;

/**
 * A session open longer than this was almost certainly left running, so its
 * length says nothing about how long the workout took.
 */
export const MAX_SESSION_MINUTES = 6 * 60;

export type ActivitySession = {
  id: string;
  title: string | null;
  startedAt: string;
  /** Null while a session is still open; those are left off the grid. */
  endedAt: string | null;
  volumeKg: number;
};

/** 0 = nothing, 1–4 = your quieter to your bigger days. */
export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export type DaySession = {
  id: string;
  title: string | null;
  /** Null when the session has no believable length. */
  minutes: number | null;
  volumeKg: number;
};

export type ActivityDay = {
  date: string;
  level: ActivityLevel;
  minutes: number;
  volumeKg: number;
  sessions: DaySession[];
  isToday: boolean;
  isFuture: boolean;
};

export type ActivityYear = {
  today: string;
  /** ACTIVITY_WEEKS columns of seven days, oldest first; the last holds today. */
  weeks: ActivityDay[][];
  /** Where each month's label goes: the column holding its first day. */
  months: { column: number; label: string }[];
  totals: { sessions: number; activeDays: number; minutes: number };
};

/** Whole minutes from start to finish, or null when that is not a real duration. */
export function sessionMinutes(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null;
  const minutes = Math.round((parseISO(endedAt).getTime() - parseISO(startedAt).getTime()) / 60_000);
  return minutes > 0 && minutes <= MAX_SESSION_MINUTES ? minutes : null;
}

/**
 * The shade for a day's minutes, fitted to this person's own year.
 *
 * Each day is placed by its rank among the days with measurable training:
 * bottom quarter 1, top quarter 4. Ties share the middle of their rank, so a
 * run of identical sessions sits mid-scale rather than all reading as your
 * quietest day — and a single long outlier cannot wash everything else out
 * the way a scale against the maximum would.
 */
export function levelFor(minutes: number, sortedMinutes: readonly number[]): Exclude<ActivityLevel, 0> {
  const n = sortedMinutes.length;
  if (n === 0 || minutes <= 0) return 1;
  let below = 0;
  let equal = 0;
  for (const value of sortedMinutes) {
    if (value < minutes) below++;
    else if (value === minutes) equal++;
  }
  const rank = (below + equal / 2) / n;
  return (1 + Math.min(3, Math.floor(rank * 4))) as Exclude<ActivityLevel, 0>;
}

export function buildActivityYear({
  sessions,
  today = new Date(),
  weekStartsOn = WEEK_STARTS_ON,
}: {
  sessions: readonly ActivitySession[];
  today?: Date;
  weekStartsOn?: WeekStartDay;
}): ActivityYear {
  const todayKey = toDateString(today);
  const first = addDays(startOfWeek(today, { weekStartsOn }), -7 * (ACTIVITY_WEEKS - 1));
  const firstKey = toDateString(first);

  const byDay = new Map<string, DaySession[]>();
  // Oldest first, so a day with two sessions lists them in the order they happened.
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const session of ordered) {
    if (!session.endedAt) continue;
    const day = toDateString(parseISO(session.startedAt));
    if (day < firstKey || day > todayKey) continue;
    const list = byDay.get(day) ?? [];
    list.push({
      id: session.id,
      title: session.title,
      minutes: sessionMinutes(session.startedAt, session.endedAt),
      volumeKg: session.volumeKg,
    });
    byDay.set(day, list);
  }

  const minutesOf = (list: DaySession[]) => list.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const sorted = [...byDay.values()]
    .map(minutesOf)
    .filter((m) => m > 0)
    .sort((a, b) => a - b);

  const weeks: ActivityDay[][] = [];
  const months: ActivityYear["months"] = [];
  for (let column = 0; column < ACTIVITY_WEEKS; column++) {
    const week: ActivityDay[] = [];
    for (let row = 0; row < 7; row++) {
      const date = addDays(first, column * 7 + row);
      const key = toDateString(date);
      const list = byDay.get(key) ?? [];
      const minutes = minutesOf(list);
      if (date.getDate() === 1) months.push({ column, label: format(date, "MMM") });
      week.push({
        date: key,
        level: list.length === 0 ? 0 : levelFor(minutes, sorted),
        minutes,
        volumeKg: list.reduce((sum, s) => sum + s.volumeKg, 0),
        sessions: list,
        isToday: key === todayKey,
        isFuture: key > todayKey,
      });
    }
    weeks.push(week);
  }

  const days = weeks.flat();
  return {
    today: todayKey,
    weeks,
    months,
    totals: {
      sessions: days.reduce((n, d) => n + d.sessions.length, 0),
      activeDays: days.filter((d) => d.sessions.length > 0).length,
      minutes: days.reduce((n, d) => n + d.minutes, 0),
    },
  };
}
