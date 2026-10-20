import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Muscle, SetLog } from "@/lib/database.types";

/**
 * Supabase caps a response at 1000 rows. A few months of training is more set
 * rows than that, so anything reading all of history reads it a page at a time.
 */
const PAGE = 1000;

type Page<T> = { data: T[] | null; error: unknown; count?: number | null };

/**
 * Every row a query matches.
 *
 * The first page also asks for the total, so the rest can be fetched in
 * parallel instead of one after another. Later pages are sized by what the
 * first one actually returned, in case the server's cap is lower than ours.
 */
async function selectAll<T>(
  run: (from: number, to: number, count: boolean) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const first = await run(0, PAGE - 1, true);
  if (first.error) throw first.error;
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  if (rows.length === 0 || rows.length >= total) return rows;

  const size = rows.length;
  const rest = await Promise.all(
    Array.from({ length: Math.ceil((total - size) / size) }, (_, i) =>
      run(size * (i + 1), size * (i + 2) - 1, false),
    ),
  );
  for (const page of rest) {
    if (page.error) throw page.error;
    rows.push(...(page.data ?? []));
  }
  return rows;
}

export type HistorySession = {
  id: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
};

export type HistorySet = {
  sessionId: string;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
};

export type HistoryExercise = {
  name: string;
  primaryMuscle: Muscle;
  secondaryMuscles: string[];
};

export type TrainingHistory = {
  sessions: HistorySession[];
  /** Completed sets only. */
  sets: HistorySet[];
  exercises: Map<string, HistoryExercise>;
};

/**
 * All of this user's training: sessions, completed sets and the exercises they
 * name — the one read behind every statistic on Progress.
 *
 * Filtered to the signed-in user explicitly rather than left to RLS, because a
 * coach can read their athletes' sessions too, and those are not the coach's
 * own year of training.
 */
export async function getTrainingHistory(): Promise<TrainingHistory> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { sessions: [], sets: [], exercises: new Map() };

  const [sessions, sets, exercises] = await Promise.all([
    selectAll((from, to, count) =>
      supabase
        .from("workout_sessions")
        .select("id, title, started_at, ended_at", count ? { count: "exact" } : undefined)
        .eq("user_id", user.id)
        .order("started_at")
        .order("id")
        .range(from, to),
    ),
    // The empty embed joins each set to its session only to filter on the
    // owner; it adds nothing to the rows that come back.
    selectAll((from, to, count) =>
      supabase
        .from("set_logs")
        .select(
          "session_id, exercise_id, weight_kg, reps, rpe, workout_sessions!inner()",
          count ? { count: "exact" } : undefined,
        )
        .eq("workout_sessions.user_id", user.id)
        .eq("is_complete", true)
        .order("id")
        .range(from, to),
    ),
    selectAll((from, to, count) =>
      supabase
        .from("exercises")
        .select("id, name, primary_muscle, secondary_muscles", count ? { count: "exact" } : undefined)
        .order("id")
        .range(from, to),
    ),
  ]);

  // lib/database.types.ts declares no Relationships, so the embedded select
  // cannot be inferred. Cast at the boundary, once.
  type SetRow = Pick<SetLog, "session_id" | "exercise_id" | "weight_kg" | "reps" | "rpe">;

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      startedAt: s.started_at,
      endedAt: s.ended_at,
    })),
    sets: (sets as unknown as SetRow[]).map((s) => ({
      sessionId: s.session_id,
      exerciseId: s.exercise_id,
      weightKg: s.weight_kg == null ? null : Number(s.weight_kg),
      reps: s.reps,
      rpe: s.rpe == null ? null : Number(s.rpe),
    })),
    exercises: new Map(
      exercises.map((e) => [
        e.id,
        {
          name: e.name,
          primaryMuscle: e.primary_muscle,
          secondaryMuscles: e.secondary_muscles ?? [],
        },
      ]),
    ),
  };
}
