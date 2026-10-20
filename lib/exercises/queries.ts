import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import type { Exercise } from "@/lib/database.types";
import { dayLabel, toDateString } from "@/lib/dates";
import type { ExerciseSet } from "./stats";

/**
 * Reads for an exercise's page. Every one names the signed-in user
 * explicitly: a coach's RLS also reaches their athletes' sessions and weeks,
 * and an athlete's sets must never show up as the coach's own history.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ExerciseDetail = Pick<
  Exercise,
  | "id" | "slug" | "name" | "owner_id" | "primary_muscle" | "secondary_muscles" | "equipment"
  | "tracking" | "image_start_url" | "image_end_url" | "how_to" | "cues" | "common_mistake"
  | "featured" | "archived_at"
>;

/**
 * A global movement or one of your own, by slug — removed ones included, so
 * a link from history still opens. Null when there is no such movement for
 * this person.
 */
export async function getExercise(
  supabase: Supabase,
  userId: string,
  slug: string,
): Promise<ExerciseDetail | null> {
  const { data, error } = await supabase
    .from("exercises")
    .select(
      "id, slug, name, owner_id, primary_muscle, secondary_muscles, equipment, tracking, image_start_url, image_end_url, how_to, cues, common_mistake, featured, archived_at",
    )
    .eq("slug", slug)
    .or(`owner_id.is.null,owner_id.eq.${userId}`)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const PAGE = 1000;
/** Years of a staple lift is a few thousand sets; past this the page shows the newest. */
const MAX_SETS = 5000;

/** Every completed set of this movement you have logged, newest first. */
export async function getExerciseSets(
  supabase: Supabase,
  userId: string,
  exerciseId: string,
): Promise<ExerciseSet[]> {
  type Row = {
    session_id: string;
    set_index: number;
    weight_kg: number | null;
    reps: number | null;
    rpe: number | null;
    duration_s: number | null;
    distance_m: number | null;
    session: { started_at: string; title: string | null };
  };

  const rows: Row[] = [];
  for (let from = 0; from < MAX_SETS; from += PAGE) {
    const { data, error } = await supabase
      .from("set_logs")
      .select(
        `session_id, set_index, weight_kg, reps, rpe, duration_s, distance_m,
         session:workout_sessions!inner ( started_at, title, user_id )`,
      )
      .eq("session.user_id", userId)
      .eq("exercise_id", exerciseId)
      .eq("is_complete", true)
      .order("logged_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    // lib/database.types.ts declares no Relationships, so the embed cannot be
    // inferred. Cast at the boundary, once.
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  return rows.map((r) => ({
    sessionId: r.session_id,
    startedAt: r.session.started_at,
    date: toDateString(parseISO(r.session.started_at)),
    sessionTitle: r.session.title,
    setIndex: r.set_index,
    weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
    reps: r.reps,
    rpe: r.rpe == null ? null : Number(r.rpe),
    durationS: r.duration_s,
    distanceM: r.distance_m == null ? null : Number(r.distance_m),
  }));
}

export type PlannableWeek = {
  weekStart: string;
  label: string;
  days: { id: string; label: string; name: string; isRest: boolean; hasIt: boolean }[];
};

/**
 * The weeks you could still add this movement to: the one under way and any
 * already written after it, each day marked if it already has the movement.
 */
export async function getPlannableWeeks(
  supabase: Supabase,
  userId: string,
  exerciseId: string,
  today: Date,
): Promise<PlannableWeek[]> {
  const todayString = toDateString(today);
  const { data: weeks, error } = await supabase
    .from("program_weeks")
    .select("id, week_start, days:program_days ( id, day_index, name, is_rest )")
    .eq("user_id", userId)
    // A week that started up to six days ago is still under way.
    .gte("week_start", toDateString(addDays(today, -6)))
    .order("week_start")
    .limit(3);
  if (error) throw error;

  type WeekRow = {
    id: string;
    week_start: string;
    days: { id: string; day_index: number; name: string; is_rest: boolean }[];
  };
  const rows = (weeks ?? []) as unknown as WeekRow[];
  const dayIds = rows.flatMap((w) => w.days.map((d) => d.id));
  const { data: planned } = dayIds.length
    ? await supabase
        .from("program_exercises")
        .select("day_id")
        .eq("exercise_id", exerciseId)
        .in("day_id", dayIds)
    : { data: [] };
  const hasIt = new Set((planned ?? []).map((p) => p.day_id));

  return rows.map((week) => {
    return {
      weekStart: week.week_start,
      label:
        week.week_start <= todayString
          ? "This week"
          : `Week of ${format(parseISO(week.week_start), "MMM d")}`,
      days: [...week.days]
        .sort((a, b) => a.day_index - b.day_index)
        .map((d) => ({
          id: d.id,
          label: dayLabel(week.week_start, d.day_index),
          name: d.name,
          isRest: d.is_rest,
          hasIt: hasIt.has(d.id),
        })),
    };
  });
}
