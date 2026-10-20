/**
 * Who gets a workout-day reminder this hour. Pure, so the decision can be
 * tested without a database or a clock.
 *
 * A reminder goes out when, in the lifter's own time zone, it is their chosen
 * hour, today is a training day of their published week, and no session has
 * been started today. Anything less certain stays quiet: a nudge on a rest day,
 * or after they've already trained, is worse than none.
 */

export type ReminderWeek = {
  weekStart: string;
  status: string;
  days: { dayIndex: number; name: string; isRest: boolean; exerciseCount: number }[];
};

export type ReminderCandidate = {
  userId: string;
  timezone: string;
  reminderHour: number;
  weeks: ReminderWeek[];
  /** Start instants of recent sessions, ISO. A day and a half back is plenty. */
  sessionStarts: string[];
};

export type Reminder = { userId: string; dayName: string };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
      });
    } catch {
      // A zone this runtime doesn't know reads as UTC rather than failing the run.
      formatter = formatterFor("UTC");
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The calendar date and hour an instant falls on in `timeZone`. */
export function localClock(instant: Date, timeZone: string): { date: string; hour: number } {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * Today's program day if it is one to train on: the published week whose seven
 * days include today, then the day at today's position in it, not a rest day,
 * and with something in it to do.
 */
export function trainingDayOn(today: string, weeks: ReminderWeek[]): { name: string } | null {
  const todayNumber = dayNumber(today);
  const week = weeks
    .filter((w) => w.status === "published")
    .filter((w) => {
      const offset = todayNumber - dayNumber(w.weekStart);
      return offset >= 0 && offset <= 6;
    })
    // Changing the week's start day can leave two weeks overlapping; the newer one is the plan.
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
  if (!week) return null;

  const index = todayNumber - dayNumber(week.weekStart);
  const day = week.days.find((d) => d.dayIndex === index);
  if (!day || day.isRest || day.exerciseCount === 0) return null;
  return { name: day.name };
}

/** Is `now` inside the reminder hour in this zone? Cheap enough to filter everyone first. */
export function isReminderHour(now: Date, timeZone: string, reminderHour: number): boolean {
  return localClock(now, timeZone).hour === reminderHour;
}

export function selectReminders(now: Date, candidates: ReminderCandidate[]): Reminder[] {
  const reminders: Reminder[] = [];
  for (const candidate of candidates) {
    const { date, hour } = localClock(now, candidate.timezone);
    if (hour !== candidate.reminderHour) continue;

    const day = trainingDayOn(date, candidate.weeks);
    if (!day) continue;

    const trainedToday = candidate.sessionStarts.some(
      (start) => localClock(new Date(start), candidate.timezone).date === date,
    );
    if (trainedToday) continue;

    reminders.push({ userId: candidate.userId, dayName: day.name });
  }
  return reminders;
}

export function reminderText(dayName: string) {
  return { title: "JLIKA Gym", body: `Today is ${dayName} — your session is waiting` };
}
