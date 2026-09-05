import { addDays, format, parseISO, startOfWeek } from "date-fns";

/** Weeks run Monday → Sunday everywhere in this app. */
export const WEEK_STARTS_ON = 1 as const;

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Day-scoped values are stored as `date`, never a timestamp, to dodge TZ drift. */
export function toDateString(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function currentWeekStart(today = new Date()) {
  return toDateString(startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }));
}

export function previousWeekStart(weekStart: string) {
  return toDateString(addDays(parseISO(weekStart), -7));
}

/** "Sep 01 – Sep 07" */
export function weekRangeLabel(weekStart: string) {
  const start = parseISO(weekStart);
  return `${format(start, "MMM dd")} – ${format(addDays(start, 6), "MMM dd")}`;
}

export function dayDate(weekStart: string, dayIndex: number) {
  return addDays(parseISO(weekStart), dayIndex);
}
