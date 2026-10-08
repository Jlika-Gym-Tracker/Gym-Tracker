import { addDays, format, parseISO, startOfWeek } from "date-fns";

/** 0 = Sunday … 6 = Saturday, the same convention date-fns uses. */
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The default for anyone who has not chosen otherwise. */
export const WEEK_STARTS_ON: WeekStartDay = 1;

/** Mon → Sun. Only for pickers that are genuinely about calendar weekdays. */
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const WEEK_START_OPTIONS = [
  { value: 1 as WeekStartDay, label: "Monday" },
  { value: 2 as WeekStartDay, label: "Tuesday" },
  { value: 3 as WeekStartDay, label: "Wednesday" },
  { value: 4 as WeekStartDay, label: "Thursday" },
  { value: 5 as WeekStartDay, label: "Friday" },
  { value: 6 as WeekStartDay, label: "Saturday" },
  { value: 0 as WeekStartDay, label: "Sunday" },
];

/** Day-scoped values are stored as `date`, never a timestamp, to dodge TZ drift. */
export function toDateString(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function currentWeekStart(
  today = new Date(),
  startsOn: WeekStartDay = WEEK_STARTS_ON,
) {
  return toDateString(startOfWeek(today, { weekStartsOn: startsOn }));
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

/**
 * The weekday a position in a week actually falls on.
 *
 * Read from the week's own start date rather than a fixed Mon..Sun array, so a
 * week that begins on a Saturday reads SAT, SUN, MON — and weeks written before
 * the owner changed their start day keep showing the days they were written for.
 */
export function dayLabel(weekStart: string, dayIndex: number) {
  return format(dayDate(weekStart, dayIndex), "EEE");
}

/** The seven weekday names in the order this user's week runs. */
export function weekDayNames(startsOn: WeekStartDay = WEEK_STARTS_ON) {
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[(startsOn + i) % 7]!);
}

/** Does `date` fall inside the seven days beginning at `weekStart`? */
export function isInWeek(weekStart: string, date = new Date()) {
  const start = parseISO(weekStart);
  const day = parseISO(toDateString(date));
  return day >= start && day <= addDays(start, 6);
}
