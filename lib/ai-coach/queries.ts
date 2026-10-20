import "server-only";
import { addDays, format, parseISO, subDays } from "date-fns";
import type { createClient } from "@/lib/supabase/server";
import { currentWeekStart, isInWeek, type WeekStartDay } from "@/lib/dates";
import type { AiCoachChangeType, Equipment, Muscle, Tracking, WeekStatus } from "@/lib/database.types";
import { intakeSchema, type CatalogEntry, type Intake, type WeekSnapshot } from "./schemas";
import { snapshotFromRows, type DayRow, type ExerciseRow } from "./week";
import type { RejectedChange, ReviewPlannedDay, ReviewSession, ReviewSet } from "./payload";

/**
 * Reads for the AI Coach. Every query names the signed-in user explicitly
 * rather than leaning on RLS alone: a coach can read athletes' training under
 * RLS, and an athlete's rows must never end up in a request sent on the
 * coach's behalf.
 */

export type Supabase = Awaited<ReturnType<typeof createClient>>;

const EXERCISE_COLUMNS =
  "id, day_id, exercise_id, position, target_sets, rep_min, rep_max, per_side, note, target_weight_kg, superset_group, target_seconds, progression, increment_kg";

/** The movements this person can pick from: the global library plus their own. */
export async function getCatalog(supabase: Supabase, userId: string): Promise<CatalogEntry[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("id, slug, name, primary_muscle, secondary_muscles, equipment, tracking, owner_id")
    .or(`owner_id.is.null,owner_id.eq.${userId}`)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    primary_muscle: row.primary_muscle as Muscle,
    secondary_muscles: row.secondary_muscles ?? [],
    equipment: row.equipment as Equipment,
    tracking: (row.tracking ?? "reps") as Tracking,
  }));
}

/** A week exactly as it stands, ids and all. `week: null` when there is none. */
export async function getWeekSnapshot(
  supabase: Supabase,
  userId: string,
  weekStart: string,
): Promise<WeekSnapshot> {
  const { data: week, error } = await supabase
    .from("program_weeks")
    .select("id, label, status, notes")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  if (!week) return { week: null, days: [] };

  const { data: days, error: daysError } = await supabase
    .from("program_days")
    .select("id, day_index, name, focus_note, is_rest, progression")
    .eq("week_id", week.id);
  if (daysError) throw daysError;

  const dayIds = (days ?? []).map((d) => d.id);
  const { data: exercises, error: exercisesError } = dayIds.length
    ? await supabase.from("program_exercises").select(EXERCISE_COLUMNS).in("day_id", dayIds)
    : { data: [], error: null };
  if (exercisesError) throw exercisesError;

  return snapshotFromRows(
    { id: week.id, label: week.label, status: week.status as WeekStatus, notes: week.notes },
    (days ?? []) as DayRow[],
    (exercises ?? []) as ExerciseRow[],
  );
}

/** Day ids among these that a session was logged against. */
export async function getSessionDayIds(supabase: Supabase, userId: string, dayIds: string[]) {
  if (dayIds.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("day_id")
    .eq("user_id", userId)
    .in("day_id", dayIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.day_id).filter((id): id is string => !!id));
}

/**
 * "This week" and "next week" for this person. If a week already contains
 * today — even one that starts on a different weekday from their current
 * setting — it is this week, so the AI Coach never writes an overlapping one.
 */
export async function resolveWeekStarts(
  supabase: Supabase,
  userId: string,
  today: string,
  startsOn: WeekStartDay,
) {
  const { data } = await supabase
    .from("program_weeks")
    .select("week_start")
    .eq("user_id", userId)
    .lte("week_start", today)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const thisWeek =
    data && isInWeek(data.week_start, parseISO(today))
      ? data.week_start
      : currentWeekStart(parseISO(today), startsOn);
  return { thisWeek, nextWeek: format(addDays(parseISO(thisWeek), 7), "yyyy-MM-dd") };
}

/**
 * The plan a review reads: this week if it has exercises, otherwise the most
 * recent earlier week that does.
 */
export async function findReviewBase(
  supabase: Supabase,
  userId: string,
  thisWeek: string,
): Promise<{ weekStart: string; week: WeekSnapshot } | null> {
  const current = await getWeekSnapshot(supabase, userId, thisWeek);
  if (current.days.some((d) => d.exercises.length > 0)) return { weekStart: thisWeek, week: current };

  const { data } = await supabase
    .from("program_weeks")
    .select("week_start")
    .eq("user_id", userId)
    .lt("week_start", thisWeek)
    .order("week_start", { ascending: false })
    .limit(8);
  for (const row of data ?? []) {
    const week = await getWeekSnapshot(supabase, userId, row.week_start);
    if (week.days.some((d) => d.exercises.length > 0)) return { weekStart: row.week_start, week };
  }
  return null;
}

export async function getIntake(supabase: Supabase, userId: string): Promise<Intake | null> {
  const { data } = await supabase
    .from("ai_coach_intakes")
    .select("answers")
    .eq("user_id", userId)
    .maybeSingle();
  const parsed = intakeSchema.safeParse(data?.answers);
  return parsed.success ? parsed.data : null;
}

/** The rows a review summarises, for the window ending today. */
export async function getReviewRows(supabase: Supabase, userId: string, today: string, windowDays: number) {
  const from = format(subDays(parseISO(today), windowDays - 1), "yyyy-MM-dd");

  const [{ data: sessions, error: sessionsError }, { data: weeks, error: weeksError }, { data: weights }, { data: profile }] =
    await Promise.all([
      supabase
        .from("workout_sessions")
        .select("id, day_id, started_at, ended_at, rating, notes")
        .eq("user_id", userId)
        .gte("started_at", `${from}T00:00:00`)
        .order("started_at"),
      supabase
        .from("program_weeks")
        .select("id, week_start")
        .eq("user_id", userId)
        .gte("week_start", format(subDays(parseISO(from), 6), "yyyy-MM-dd"))
        .lte("week_start", today),
      supabase
        .from("body_metrics")
        .select("measured_on, weight_kg")
        .eq("user_id", userId)
        .gte("measured_on", format(subDays(parseISO(from), 45), "yyyy-MM-dd"))
        .order("measured_on"),
      supabase.from("profiles").select("goal_weight_kg").eq("id", userId).maybeSingle(),
    ]);
  if (sessionsError) throw sessionsError;
  if (weeksError) throw weeksError;

  const sessionRows = (sessions ?? []) as ReviewSession[];
  const weekStartById = new Map((weeks ?? []).map((w) => [w.id, w.week_start]));

  // Days of the weeks in the window, plus any older day a session followed.
  const { data: daysInWindow } = weekStartById.size
    ? await supabase
        .from("program_days")
        .select("id, week_id, day_index, is_rest")
        .in("week_id", [...weekStartById.keys()])
    : { data: [] };
  const known = new Set((daysInWindow ?? []).map((d) => d.id));
  const missing = [...new Set(sessionRows.map((s) => s.day_id).filter((id): id is string => !!id && !known.has(id)))];
  let extraDays: { id: string; week_id: string; day_index: number; is_rest: boolean }[] = [];
  if (missing.length) {
    const { data } = await supabase.from("program_days").select("id, week_id, day_index, is_rest").in("id", missing);
    const weekIds = [...new Set((data ?? []).map((d) => d.week_id))];
    const { data: owned } = weekIds.length
      ? await supabase.from("program_weeks").select("id, week_start").eq("user_id", userId).in("id", weekIds)
      : { data: [] };
    for (const w of owned ?? []) weekStartById.set(w.id, w.week_start);
    extraDays = (data ?? []).filter((d) => weekStartById.has(d.week_id));
  }
  const allDays = [...(daysInWindow ?? []), ...extraDays];

  const dayIds = allDays.map((d) => d.id);
  const { data: planned } = dayIds.length
    ? await supabase
        .from("program_exercises")
        .select("day_id, exercise_id, target_sets, rep_min, rep_max, target_seconds")
        .in("day_id", dayIds)
    : { data: [] };

  const plannedDays: ReviewPlannedDay[] = allDays.map((d) => ({
    id: d.id,
    week_start: weekStartById.get(d.week_id)!,
    day_index: d.day_index,
    is_rest: d.is_rest,
    exercises: (planned ?? [])
      .filter((p) => p.day_id === d.id)
      .map((p) => ({
        exercise_id: p.exercise_id,
        target_sets: p.target_sets,
        rep_min: p.rep_min,
        rep_max: p.rep_max,
        target_seconds: p.target_seconds,
      })),
  }));

  const sessionIds = sessionRows.map((s) => s.id);
  const { data: sets, error: setsError } = sessionIds.length
    ? await supabase
        .from("set_logs")
        .select("session_id, exercise_id, set_index, weight_kg, reps, rpe, duration_s, is_complete")
        .in("session_id", sessionIds)
    : { data: [], error: null };
  if (setsError) throw setsError;

  return {
    sessions: sessionRows,
    plannedDays,
    sets: (sets ?? []).map((s) => ({
      ...s,
      weight_kg: s.weight_kg == null ? null : Number(s.weight_kg),
      rpe: s.rpe == null ? null : Number(s.rpe),
    })) as ReviewSet[],
    bodyweights: (weights ?? []).map((w) => ({
      measured_on: w.measured_on,
      weight_kg: w.weight_kg == null ? null : Number(w.weight_kg),
    })),
    goalWeightKg: profile?.goal_weight_kg == null ? null : Number(profile.goal_weight_kg),
  };
}

/** Changes the person turned down in the last 90 days, newest first. */
export async function getRejectedChanges(supabase: Supabase, userId: string): Promise<RejectedChange[]> {
  const since = subDays(new Date(), 90).toISOString();
  const { data: proposals } = await supabase
    .from("ai_coach_proposals")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "review")
    .gte("created_at", since);
  const ids = (proposals ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("ai_coach_changes")
    .select("type, target_text, before_text, after_text, decided_at")
    .in("proposal_id", ids)
    .eq("decision", "rejected")
    .order("decided_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((row) => ({ ...row, type: row.type as AiCoachChangeType }));
}

