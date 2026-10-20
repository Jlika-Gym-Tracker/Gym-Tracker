/**
 * What the AI Coach is shown, built from rows by pure functions.
 *
 * An allowlist by construction: every field below is copied in by name and
 * nothing is spread through, so a column added to a table later cannot ride
 * along to the model by accident. Ids, names of people, email, avatars,
 * photos and crew data never appear — exercises are named by slug, days by
 * position, and dates are the only identifiers of a session.
 *
 * Numbers are summarised here rather than sent raw: the model reads a page of
 * evidence, not a database dump, which keeps the request small and the
 * reasoning about the person's training rather than about arithmetic.
 */

import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { effectivePolicy } from "@/lib/program/policies";
import { estimateOneRepMax } from "@/lib/training/e1rm";
import type { Equipment, Muscle } from "@/lib/database.types";
import type { CatalogEntry, Change, WeekSnapshot } from "./schemas";
import { fillWeek } from "./week";

// ---------------------------------------------------------------- catalog

/**
 * The closed list the model chooses from: the person's library, narrowed to
 * the equipment they have. Bodyweight movements are always in.
 */
export function buildCatalog(library: CatalogEntry[], equipment?: readonly Equipment[]): CatalogEntry[] {
  const allowed = equipment ? new Set<Equipment>([...equipment, "body_only"]) : null;
  return library
    .filter((entry) => !allowed || allowed.has(entry.equipment))
    .sort((a, b) => a.primary_muscle.localeCompare(b.primary_muscle) || a.name.localeCompare(b.name));
}

/** One line per movement: slug | name | primary muscle | equipment | logged by. */
export function catalogText(catalog: CatalogEntry[]): string {
  return catalog
    .map((e) => [e.slug, e.name, e.primary_muscle, e.equipment, e.tracking].join(" | "))
    .join("\n");
}

// -------------------------------------------------------------- the plan

export type PlanForModel = {
  days: {
    day_index: number;
    weekday: string;
    name: string;
    rest: boolean;
    rule: string;
    exercises: {
      slug: string;
      sets: number;
      reps: string | null;
      seconds: number | null;
      load_kg: number | null;
      superset: number | null;
      rule: string;
      rule_is_override: boolean;
    }[];
  }[];
};

/** A week as the model reads it: slugs, numbers and rules, no ids. */
export function planForModel(week: WeekSnapshot, catalog: CatalogEntry[], dayLabels: string[]): PlanForModel {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  return {
    days: fillWeek(week.days).map((day) => ({
      day_index: day.day_index,
      weekday: dayLabels[day.day_index] ?? `Day ${day.day_index + 1}`,
      name: day.name,
      rest: day.is_rest || day.exercises.length === 0,
      rule: day.progression,
      exercises: day.exercises.flatMap((e) => {
        const entry = byId.get(e.exercise_id);
        if (!entry) return [];
        return [
          {
            slug: entry.slug,
            sets: e.target_sets,
            reps: e.rep_min == null ? null : e.rep_max != null && e.rep_max !== e.rep_min ? `${e.rep_min}-${e.rep_max}` : String(e.rep_min),
            seconds: e.target_seconds,
            load_kg: e.target_weight_kg,
            superset: e.superset_group,
            rule: effectivePolicy(e.progression, day.progression, entry.tracking),
            rule_is_override: e.progression != null,
          },
        ];
      }),
    })),
  };
}

// ------------------------------------------------------------- the review

export const REVIEW_WINDOW_DAYS = 28;

/** Muscles a balanced week trains. Neck, forearms, abductors… are optional. */
export const MAJOR_MUSCLES: Muscle[] = [
  "chest", "lats", "middle_back", "shoulders", "biceps", "triceps",
  "quadriceps", "hamstrings", "glutes", "calves", "abdominals",
];

export type ReviewSession = {
  id: string;
  day_id: string | null;
  started_at: string;
  ended_at: string | null;
  rating: number | null;
  notes: string | null;
};

export type ReviewPlannedDay = {
  id: string;
  week_start: string;
  day_index: number;
  is_rest: boolean;
  exercises: {
    exercise_id: string;
    target_sets: number;
    rep_min: number | null;
    rep_max: number | null;
    target_seconds: number | null;
  }[];
};

export type ReviewSet = {
  session_id: string;
  exercise_id: string;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  duration_s: number | null;
  is_complete: boolean;
};

export type RejectedChange = {
  type: Change["type"];
  target_text: string;
  before_text: string;
  after_text: string;
  decided_at: string | null;
};

export type ReviewInput = {
  today: string;
  windowDays?: number;
  base: WeekSnapshot;
  baseWeekStart: string;
  dayLabels: string[];
  catalog: CatalogEntry[];
  sessions: ReviewSession[];
  plannedDays: ReviewPlannedDay[];
  sets: ReviewSet[];
  bodyweights: { measured_on: string; weight_kg: number | null }[];
  goalWeightKg: number | null;
  sessionMinutes: number | null;
  rejected: RejectedChange[];
};

export type ExerciseEvidence = {
  slug: string;
  name: string;
  muscle: string;
  logged_by: string;
  sessions: number;
  planned_sets: number;
  completed_sets: number;
  sets_hit: number;
  sets_missed: number;
  sets_above_range: number;
  sets_skipped: number;
  avg_rpe: number | null;
  rpe_early: number | null;
  rpe_late: number | null;
  sessions_since_progress: number | null;
  recent: string[];
};

export type SessionNote = { date: string; day: string; rating: string | null; text: string };

export type ReviewPayload = {
  window: { from: string; to: string; days: number };
  units: "kg";
  plan: PlanForModel & { week_start: string };
  adherence: {
    planned_training_days: number;
    sessions_completed: number;
    sessions_on_plan: number;
    sessions_off_plan: number;
    planned_days_missed: number;
    by_week: { week_start: string; planned: number; done: number }[];
  };
  duration: {
    target_minutes: number | null;
    sessions_timed: number;
    average_minutes: number | null;
    longest_minutes: number | null;
    sessions_over_target: number | null;
  };
  ratings: { too_easy: number; about_right: number; brutal: number; unrated: number };
  effort_by_week: { week_start: string; avg_rpe: number | null; rated_sets: number }[];
  exercises: ExerciseEvidence[];
  muscles: {
    completed_sets_by_muscle: Partial<Record<Muscle, number>>;
    untrained: Muscle[];
    secondary_only: Muscle[];
  };
  bodyweight: {
    goal_kg: number | null;
    entries: number;
    first: { date: string; kg: number } | null;
    last: { date: string; kg: number } | null;
    change_kg: number | null;
    per_week_kg: number | null;
    moving_toward_goal: boolean | null;
  };
  /** Free text the person typed. The prompt wraps each one as data. */
  notes: SessionNote[];
  previously_rejected: { type: string; target: string; before: string; after: string; decided_on: string | null }[];
};

const RATING: Record<number, string> = { 1: "too easy", 2: "about right", 3: "brutal" };
const MAX_NOTES = 12;
const NOTE_CHARS = 280;
const MAX_REJECTED = 20;
/** Longer than this and the session was probably left open, not trained. */
const MAX_PLAUSIBLE_MINUTES = 240;

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const dateOf = (iso: string) => iso.slice(0, 10);

export function buildReviewPayload(input: ReviewInput): ReviewPayload {
  const windowDays = input.windowDays ?? REVIEW_WINDOW_DAYS;
  const to = input.today;
  const from = format(addDays(parseISO(to), -windowDays + 1), "yyyy-MM-dd");
  const inWindow = (date: string) => date >= from && date <= to;

  const byId = new Map(input.catalog.map((e) => [e.id, e]));
  const dayById = new Map(input.plannedDays.map((d) => [d.id, d]));
  const completed = input.sessions
    .filter((s) => s.ended_at && inWindow(dateOf(s.started_at)))
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const completedIds = new Set(completed.map((s) => s.id));
  const sessionById = new Map(completed.map((s) => [s.id, s]));

  // ------------------------------------------------------------ adherence
  const plannedDates = input.plannedDays
    .filter((d) => !d.is_rest && d.exercises.length > 0)
    .map((d) => ({ day: d, date: format(addDays(parseISO(d.week_start), d.day_index), "yyyy-MM-dd") }))
    // Today still has time to happen; it is not missed yet.
    .filter(({ date }) => date >= from && date < to);
  const followed = new Set(completed.map((s) => s.day_id).filter((id): id is string => !!id));
  const weekStarts = [...new Set(plannedDates.map((p) => p.day.week_start))].sort();

  const adherence = {
    planned_training_days: plannedDates.length,
    sessions_completed: completed.length,
    sessions_on_plan: completed.filter((s) => s.day_id && dayById.has(s.day_id)).length,
    sessions_off_plan: completed.filter((s) => !s.day_id || !dayById.has(s.day_id)).length,
    planned_days_missed: plannedDates.filter(({ day }) => !followed.has(day.id)).length,
    by_week: weekStarts.map((week_start) => {
      const end = format(addDays(parseISO(week_start), 7), "yyyy-MM-dd");
      return {
        week_start,
        planned: plannedDates.filter((p) => p.day.week_start === week_start).length,
        done: completed.filter((s) => dateOf(s.started_at) >= week_start && dateOf(s.started_at) < end).length,
      };
    }),
  };

  // ------------------------------------------------------------- duration
  const minutes = completed
    .map((s) => (Date.parse(s.ended_at!) - Date.parse(s.started_at)) / 60000)
    .filter((m) => m > 0 && m <= MAX_PLAUSIBLE_MINUTES);
  const target = input.sessionMinutes;
  const duration = {
    target_minutes: target,
    sessions_timed: minutes.length,
    average_minutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
    longest_minutes: minutes.length ? Math.round(Math.max(...minutes)) : null,
    // Some slack: ten minutes over an hour is a long warm-up, not a problem.
    sessions_over_target: target ? minutes.filter((m) => m > target * 1.15).length : null,
  };

  // -------------------------------------------------------------- ratings
  const ratings = { too_easy: 0, about_right: 0, brutal: 0, unrated: 0 };
  for (const s of completed) {
    if (s.rating === 1) ratings.too_easy++;
    else if (s.rating === 2) ratings.about_right++;
    else if (s.rating === 3) ratings.brutal++;
    else ratings.unrated++;
  }

  // ------------------------------------------------------------ the sets
  const sets = input.sets.filter((s) => s.is_complete && completedIds.has(s.session_id));
  const setsBySession = new Map<string, ReviewSet[]>();
  for (const set of input.sets) {
    if (!completedIds.has(set.session_id)) continue;
    const list = setsBySession.get(set.session_id) ?? [];
    list.push(set);
    setsBySession.set(set.session_id, list);
  }

  const effortWeeks = new Map<string, number[]>();
  const baseWeekDay = parseISO(input.baseWeekStart).getDay();
  for (const set of sets) {
    if (set.rpe == null) continue;
    const session = sessionById.get(set.session_id)!;
    const date = parseISO(dateOf(session.started_at));
    const offset = (date.getDay() - baseWeekDay + 7) % 7;
    const weekStart = format(addDays(date, -offset), "yyyy-MM-dd");
    const list = effortWeeks.get(weekStart) ?? [];
    list.push(Number(set.rpe));
    effortWeeks.set(weekStart, list);
  }
  const effort_by_week = [...effortWeeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, rpes]) => ({ week_start, avg_rpe: avg(rpes), rated_sets: rpes.length }));

  // -------------------------------------------------------- per exercise
  const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];
  const exercises: ExerciseEvidence[] = exerciseIds.flatMap((exerciseId) => {
    const entry = byId.get(exerciseId);
    if (!entry) return [];

    const sessionsWith = completed.filter((s) =>
      (setsBySession.get(s.id) ?? []).some((set) => set.exercise_id === exerciseId && set.is_complete),
    );

    let planned = 0;
    let hit = 0;
    let missed = 0;
    let above = 0;
    let skipped = 0;
    const perSessionRpe: number[] = [];
    const bests: number[] = [];
    const recent: string[] = [];

    for (const session of sessionsWith) {
      const done = (setsBySession.get(session.id) ?? [])
        .filter((set) => set.exercise_id === exerciseId && set.is_complete)
        .sort((a, b) => a.set_index - b.set_index);
      const plan = session.day_id
        ? dayById.get(session.day_id)?.exercises.find((e) => e.exercise_id === exerciseId)
        : undefined;

      if (plan) {
        planned += plan.target_sets;
        skipped += Math.max(0, plan.target_sets - done.length);
        for (const set of done) {
          if (entry.tracking === "reps" && plan.rep_min != null && set.reps != null) {
            if (set.reps < plan.rep_min) missed++;
            else hit++;
            if (plan.rep_max != null && set.reps > plan.rep_max) above++;
          } else if (entry.tracking !== "reps" && plan.target_seconds != null && set.duration_s != null) {
            if (set.duration_s < plan.target_seconds) missed++;
            else hit++;
          }
        }
      }

      const rpes = done.map((s) => s.rpe).filter((r): r is number => r != null).map(Number);
      if (rpes.length) perSessionRpe.push(rpes.reduce((a, b) => a + b, 0) / rpes.length);

      const best = sessionBest(done, entry.tracking);
      if (best != null) bests.push(best);

      recent.push(`${dateOf(session.started_at)}: ${describeSets(done, entry.tracking)}`);
    }

    const half = Math.floor(perSessionRpe.length / 2);
    return [
      {
        slug: entry.slug,
        name: entry.name,
        muscle: entry.primary_muscle,
        logged_by: entry.tracking,
        sessions: sessionsWith.length,
        planned_sets: planned,
        completed_sets: sessionsWith.reduce(
          (n, s) => n + (setsBySession.get(s.id) ?? []).filter((x) => x.exercise_id === exerciseId && x.is_complete).length,
          0,
        ),
        sets_hit: hit,
        sets_missed: missed,
        sets_above_range: above,
        sets_skipped: skipped,
        avg_rpe: avg(perSessionRpe),
        rpe_early: perSessionRpe.length >= 2 ? avg(perSessionRpe.slice(0, half)) : null,
        rpe_late: perSessionRpe.length >= 2 ? avg(perSessionRpe.slice(half)) : null,
        sessions_since_progress: sessionsSinceProgress(bests),
        recent: recent.slice(-3),
      },
    ];
  });
  exercises.sort((a, b) => b.sessions - a.sessions || a.slug.localeCompare(b.slug));

  // -------------------------------------------------------------- muscles
  const primary = new Map<Muscle, number>();
  const secondary = new Map<string, number>();
  for (const set of sets) {
    const entry = byId.get(set.exercise_id);
    if (!entry) continue;
    primary.set(entry.primary_muscle, (primary.get(entry.primary_muscle) ?? 0) + 1);
    for (const m of entry.secondary_muscles) secondary.set(m, (secondary.get(m) ?? 0) + 1);
  }
  const muscles = {
    completed_sets_by_muscle: Object.fromEntries([...primary.entries()].sort(([a], [b]) => a.localeCompare(b))) as Partial<
      Record<Muscle, number>
    >,
    untrained: MAJOR_MUSCLES.filter((m) => !primary.get(m) && !secondary.get(m)),
    secondary_only: MAJOR_MUSCLES.filter((m) => !primary.get(m) && !!secondary.get(m)),
  };

  // ----------------------------------------------------------- bodyweight
  const weighed = input.bodyweights
    .filter((b) => b.weight_kg != null && b.measured_on <= to)
    .map((b) => ({ date: b.measured_on, kg: Number(b.weight_kg) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const before = weighed.filter((b) => b.date < from).at(-1);
  const during = weighed.filter((b) => inWindow(b.date));
  const series = before ? [before, ...during] : during;
  const first = series[0] ?? null;
  const last = series.at(-1) ?? null;
  const span = first && last ? differenceInCalendarDays(parseISO(last.date), parseISO(first.date)) : 0;
  const goal = input.goalWeightKg == null ? null : Number(input.goalWeightKg);
  const bodyweight = {
    goal_kg: goal,
    entries: during.length,
    first,
    last,
    change_kg: first && last && first !== last ? round1(last.kg - first.kg) : null,
    per_week_kg: first && last && span >= 7 ? round1(((last.kg - first.kg) / span) * 7) : null,
    moving_toward_goal:
      goal != null && first && last && first !== last
        ? Math.abs(last.kg - goal) < Math.abs(first.kg - goal)
        : null,
  };

  // ---------------------------------------------------------------- notes
  const notes: SessionNote[] = completed
    .filter((s) => s.notes && s.notes.trim())
    .slice(-MAX_NOTES)
    .map((s) => {
      const day = s.day_id ? dayById.get(s.day_id) : undefined;
      return {
        date: dateOf(s.started_at),
        day: day ? `day ${day.day_index}` : "off plan",
        rating: s.rating ? (RATING[s.rating] ?? null) : null,
        text: s.notes!.trim().slice(0, NOTE_CHARS),
      };
    });

  const previously_rejected = input.rejected.slice(0, MAX_REJECTED).map((r) => ({
    type: r.type,
    target: r.target_text,
    before: r.before_text,
    after: r.after_text,
    decided_on: r.decided_at ? dateOf(r.decided_at) : null,
  }));

  return {
    window: { from, to, days: windowDays },
    units: "kg",
    plan: { week_start: input.baseWeekStart, ...planForModel(input.base, input.catalog, input.dayLabels) },
    adherence,
    duration,
    ratings,
    effort_by_week,
    exercises,
    muscles,
    bodyweight,
    notes,
    previously_rejected,
  };
}

/** A session's best effort at one movement: top e1RM, top reps, or longest hold. */
function sessionBest(sets: ReviewSet[], tracking: CatalogEntry["tracking"]): number | null {
  if (tracking === "cardio") return null;
  if (tracking === "time") {
    const holds = sets.map((s) => s.duration_s ?? 0).filter((d) => d > 0);
    return holds.length ? Math.max(...holds) : null;
  }
  const loaded = sets.filter((s) => (s.weight_kg ?? 0) > 0 && (s.reps ?? 0) > 0);
  if (loaded.length) return Math.max(...loaded.map((s) => estimateOneRepMax(Number(s.weight_kg), s.reps!)));
  // Bodyweight work: the best set is the most reps.
  const reps = sets.map((s) => s.reps ?? 0).filter((r) => r > 0);
  return reps.length ? Math.max(...reps) : null;
}

/**
 * How many sessions in a row, most recent last, have not beaten the best
 * before them. Null with fewer than two sessions — one point is not a trend.
 */
export function sessionsSinceProgress(bests: number[]): number | null {
  if (bests.length < 2) return null;
  let best = bests[0]!;
  let since = 0;
  for (const value of bests.slice(1)) {
    // Within half a percent is noise from rounding, not progress.
    if (value > best * 1.005) {
      best = value;
      since = 0;
    } else {
      since++;
    }
  }
  return since;
}

function describeSets(sets: ReviewSet[], tracking: CatalogEntry["tracking"]): string {
  const parts = sets.map((s) => {
    if (tracking !== "reps") return s.duration_s != null ? `${s.duration_s}s` : "?";
    const reps = s.reps ?? "?";
    return (s.weight_kg ?? 0) > 0 ? `${Number(s.weight_kg)}×${reps}` : `${reps}`;
  });
  const rpes = sets.map((s) => s.rpe).filter((r): r is number => r != null);
  return `${parts.join(", ")}${rpes.length ? ` @RPE ${rpes.map(Number).join("/")}` : ""}`;
}

// --------------------------------------------------------------- the intake

export type PlanRequestContext = {
  goal: string;
  experience: string;
  days_per_week: number;
  preferred_days: string[];
  session_minutes: number;
  equipment: Equipment[];
  /** Only present when the person ticked "use my sex, age and height". */
  body: { sex: string | null; age: number | null; height_cm: number | null } | null;
  week_days: { day_index: number; weekday: string }[];
};

export function ageOn(birthDate: string | null, today: string): number | null {
  if (!birthDate) return null;
  const born = parseISO(birthDate);
  const now = parseISO(today);
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age--;
  return age > 0 && age < 120 ? age : null;
}
