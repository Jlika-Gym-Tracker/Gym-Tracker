import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DayProgression, Exercise, ProgressionPolicy, SetLog } from "@/lib/database.types";
import type { LoggedSet, PastSession, SessionTarget } from "@/lib/program/prescription";
import { bestSet } from "@/lib/training/e1rm";

export type SessionExercise = {
  exercise: Pick<
    Exercise,
    "id" | "name" | "slug" | "primary_muscle" | "secondary_muscles" |
    "equipment" | "image_start_url" | "image_end_url" | "cues" | "how_to" |
    "common_mistake" | "video_url" | "tracking"
  >;
  /** The prescription from the program, when this session follows a plan. */
  plan: {
    target_sets: number;
    rep_min: number | null;
    rep_max: number | null;
    per_side: boolean;
    note: string | null;
    target_weight_kg: number | null;
    target_seconds: number | null;
    superset_group: number | null;
    progression: ProgressionPolicy | null;
    increment_kg: number | null;
  } | null;
  sets: SetLog[];
};

export type SessionDetail = {
  id: string;
  title: string | null;
  started_at: string;
  ended_at: string | null;
  bodyweight_kg: number | null;
  notes: string | null;
  rating: number | null;
  day: {
    id: string;
    name: string;
    focus_note: string | null;
    progression: DayProgression;
  } | null;
  exercises: SessionExercise[];
};

const EXERCISE_FIELDS =
  "id, name, slug, primary_muscle, secondary_muscles, equipment, image_start_url, image_end_url, cues, how_to, common_mistake, video_url, tracking";

/**
 * The signed-in user's id. Queries over sessions and sets filter on it
 * explicitly: a coach's RLS also lets them read their athletes' training, and
 * an athlete's sets must never become the coach's own history, bests or
 * "session in progress".
 */
async function userId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getActiveSessionId(): Promise<string | null> {
  const supabase = await createClient();
  const me = await userId(supabase);
  if (!me) return null;
  const { data } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", me)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * A session merged with the plan it follows.
 *
 * The plan comes from program_days; the logged sets come from set_logs, which
 * reference exercises directly. An exercise that was logged but later removed
 * from the program still shows up, because history outranks the plan.
 */
export async function getSession(sessionId: string): Promise<SessionDetail | null> {
  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("workout_sessions")
    .select(
      `id, title, started_at, ended_at, bodyweight_kg, notes, rating,
       day:program_days ( id, name, focus_note, progression )`,
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!session) return null;

  // lib/database.types.ts is hand-maintained and declares no Relationships, so
  // embedded selects cannot be inferred. Cast at the boundary, once.
  const day = (session.day ?? null) as unknown as SessionDetail["day"];

  const [{ data: planned }, { data: logs }] = await Promise.all([
    day
      ? supabase
          .from("program_exercises")
          .select(
            `position, target_sets, rep_min, rep_max, per_side, note, target_weight_kg,
             target_seconds, superset_group, progression, increment_kg,
             exercise:exercises ( ${EXERCISE_FIELDS} )`,
          )
          .eq("day_id", day.id)
          .order("position")
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("set_logs")
      .select(`*, exercise:exercises ( ${EXERCISE_FIELDS} )`)
      .eq("session_id", sessionId)
      .order("set_index"),
  ]);

  const byExercise = new Map<string, SessionExercise>();

  for (const row of planned ?? []) {
    const exercise = row.exercise as unknown as SessionExercise["exercise"];
    byExercise.set(exercise.id, {
      exercise,
      plan: {
        target_sets: row.target_sets,
        rep_min: row.rep_min,
        rep_max: row.rep_max,
        per_side: row.per_side,
        note: row.note,
        target_weight_kg: row.target_weight_kg,
        target_seconds: row.target_seconds,
        superset_group: row.superset_group,
        progression: row.progression,
        increment_kg: row.increment_kg,
      },
      sets: [],
    });
  }

  for (const log of logs ?? []) {
    const { exercise, ...set } = log as unknown as SetLog & {
      exercise: SessionExercise["exercise"];
    };
    const entry = byExercise.get(exercise.id);
    if (entry) entry.sets.push(set);
    else byExercise.set(exercise.id, { exercise, plan: null, sets: [set] });
  }

  for (const entry of byExercise.values()) {
    entry.sets.sort((a, b) => a.set_index - b.set_index);
  }

  return { ...session, day, exercises: [...byExercise.values()] };
}

export type PersonalBest = {
  /** The set with the best estimated 1RM (or the heaviest, past the rep cap). */
  bestSet: { weight_kg: number | null; reps: number | null } | null;
  /** Heaviest load ever ticked off, at any rep count. */
  heaviestKg: number;
  /** Longest hold or session, for timed and cardio movements. */
  longestS: number;
};

/**
 * All-time bests per movement, from every completed set outside `excludeSessionId`
 * — the bar a set has to clear to be called a PR. All-time rather than recent,
 * so a PR badge means what it says.
 */
export async function getPersonalBests(
  exerciseIds: string[],
  { excludeSessionId }: { excludeSessionId?: string } = {},
): Promise<Map<string, PersonalBest>> {
  const result = new Map<string, PersonalBest>();
  if (exerciseIds.length === 0) return result;

  const supabase = await createClient();
  const me = await userId(supabase);
  if (!me) return result;
  let query = supabase
    .from("set_logs")
    .select("exercise_id, weight_kg, reps, duration_s, session:workout_sessions!inner ( user_id )")
    .eq("session.user_id", me)
    .in("exercise_id", exerciseIds)
    .eq("is_complete", true)
    .limit(20000);
  if (excludeSessionId) query = query.neq("session_id", excludeSessionId);
  const { data, error } = await query;
  if (error) throw error;

  const byExercise = new Map<string, { weight_kg: number | null; reps: number | null; duration_s: number | null }[]>();
  for (const row of data ?? []) {
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push({
      weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
      reps: row.reps,
      duration_s: row.duration_s,
    });
    byExercise.set(row.exercise_id, list);
  }
  for (const [id, sets] of byExercise) {
    const top = bestSet(sets);
    result.set(id, {
      bestSet: top ? { weight_kg: top.weight_kg, reps: top.reps } : null,
      heaviestKg: Math.max(0, ...sets.map((s) => Number(s.weight_kg ?? 0))),
      longestS: Math.max(0, ...sets.map((s) => s.duration_s ?? 0)),
    });
  }
  return result;
}

/**
 * Recent sessions of several movements at once, each with the plan the session
 * followed — what the progression rules judge against.
 *
 * A session points at the program day it followed; that day's row for the
 * movement says what was asked of it then. Sessions without a day (extras, or
 * a day since deleted) come back with `target: null` and are judged against
 * today's plan instead.
 */
export async function getRecentSessions(
  exerciseIds: string[],
  {
    excludeSessionId,
    before,
    perExercise = 8,
  }: { excludeSessionId?: string; before?: string; perExercise?: number } = {},
): Promise<Map<string, PastSession[]>> {
  const result = new Map<string, PastSession[]>();
  if (exerciseIds.length === 0) return result;

  const supabase = await createClient();
  const me = await userId(supabase);
  if (!me) return result;
  let query = supabase
    .from("set_logs")
    .select(
      `exercise_id, session_id, set_index, weight_kg, reps, rpe, duration_s, distance_m, logged_at,
       session:workout_sessions!inner ( started_at, day_id, user_id )`,
    )
    .eq("session.user_id", me)
    .in("exercise_id", exerciseIds)
    .eq("is_complete", true)
    .order("logged_at", { ascending: false })
    .limit(perExercise * exerciseIds.length * 8);
  if (excludeSessionId) query = query.neq("session_id", excludeSessionId);
  if (before) query = query.lt("logged_at", before);

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    exercise_id: string;
    session_id: string;
    set_index: number;
    weight_kg: number | null;
    reps: number | null;
    rpe: number | null;
    duration_s: number | null;
    distance_m: number | null;
    session: { started_at: string; day_id: string | null };
  };
  const rows = (data ?? []) as unknown as Row[];

  const dayIds = [...new Set(rows.map((r) => r.session.day_id).filter((d): d is string => !!d))];
  const targets = new Map<string, SessionTarget>();
  if (dayIds.length) {
    const { data: planned } = await supabase
      .from("program_exercises")
      .select("day_id, exercise_id, target_sets, rep_min, rep_max, target_seconds")
      .in("day_id", dayIds)
      .in("exercise_id", exerciseIds);
    for (const p of planned ?? []) {
      targets.set(`${p.day_id}:${p.exercise_id}`, {
        sets: p.target_sets,
        repMin: p.rep_min,
        repMax: p.rep_max,
        seconds: p.target_seconds,
      });
    }
  }

  type Gathered = {
    exerciseId: string;
    date: string;
    target: SessionTarget | null;
    sets: (LoggedSet & { i: number })[];
  };
  const bySession = new Map<string, Gathered>();
  for (const row of rows) {
    const key = `${row.exercise_id}:${row.session_id}`;
    let entry = bySession.get(key);
    if (!entry) {
      entry = {
        exerciseId: row.exercise_id,
        date: row.session.started_at,
        sets: [],
        target: row.session.day_id
          ? (targets.get(`${row.session.day_id}:${row.exercise_id}`) ?? null)
          : null,
      };
      bySession.set(key, entry);
    }
    entry.sets.push({
      i: row.set_index,
      weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
      reps: row.reps,
      rpe: row.rpe == null ? null : Number(row.rpe),
      duration_s: row.duration_s,
      distance_m: row.distance_m == null ? null : Number(row.distance_m),
    });
  }

  for (const { exerciseId, sets, ...entry } of bySession.values()) {
    const list = result.get(exerciseId) ?? [];
    // Set order matters to Greyskull, whose last set is the one taken to failure.
    sets.sort((a, b) => a.i - b.i);
    list.push({
      ...entry,
      sets: sets.map((s) => ({
        weight_kg: s.weight_kg,
        reps: s.reps,
        rpe: s.rpe,
        duration_s: s.duration_s,
        distance_m: s.distance_m,
      })),
    });
    result.set(exerciseId, list);
  }
  for (const [id, list] of result) {
    list.sort((a, b) => b.date.localeCompare(a.date));
    result.set(id, list.slice(0, perExercise));
  }
  return result;
}

/** Every completed set of a session, for the running totals. */
export async function getSessionTotals(sessionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("set_logs")
    .select("weight_kg, reps, is_complete")
    .eq("session_id", sessionId);
  const complete = (data ?? []).filter((s) => s.is_complete);
  return {
    setsDone: complete.length,
    volumeKg: complete.reduce((sum, s) => sum + Number(s.weight_kg ?? 0) * (s.reps ?? 0), 0),
  };
}
