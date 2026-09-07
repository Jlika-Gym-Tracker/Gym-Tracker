import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Exercise, SetLog } from "@/lib/database.types";

export type SessionExercise = {
  exercise: Pick<
    Exercise,
    "id" | "name" | "slug" | "primary_muscle" | "secondary_muscles" |
    "equipment" | "image_start_url" | "image_end_url" | "cues" | "how_to" |
    "common_mistake" | "video_url"
  >;
  /** The prescription from the program, when this session follows a plan. */
  plan: {
    target_sets: number;
    rep_min: number | null;
    rep_max: number | null;
    per_side: boolean;
    note: string | null;
    target_weight_kg: number | null;
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
  day: { id: string; name: string; focus_note: string | null } | null;
  exercises: SessionExercise[];
};

const EXERCISE_FIELDS =
  "id, name, slug, primary_muscle, secondary_muscles, equipment, image_start_url, image_end_url, cues, how_to, common_mistake, video_url";

export async function getActiveSessionId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_sessions")
    .select("id")
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
      `id, title, started_at, ended_at, bodyweight_kg, notes,
       day:program_days ( id, name, focus_note )`,
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

export type ExerciseHistoryEntry = {
  sessionId: string;
  date: string;
  sets: Pick<SetLog, "weight_kg" | "reps" | "rpe">[];
  topWeightKg: number;
  volumeKg: number;
};

/**
 * Completed sets for one movement, newest first, grouped by session — feeds the
 * history bars and the progression hint.
 */
export async function getExerciseHistory(
  exerciseId: string,
  { excludeSessionId, limit = 6 }: { excludeSessionId?: string; limit?: number } = {},
): Promise<ExerciseHistoryEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("set_logs")
    .select("session_id, weight_kg, reps, rpe, logged_at, session:workout_sessions ( started_at )")
    .eq("exercise_id", exerciseId)
    .eq("is_complete", true)
    .order("logged_at", { ascending: false })
    .limit(limit * 8);
  if (excludeSessionId) query = query.neq("session_id", excludeSessionId);

  const { data, error } = await query;
  if (error) throw error;

  const bySession = new Map<string, ExerciseHistoryEntry>();
  for (const row of data ?? []) {
    const startedAt =
      (row.session as unknown as { started_at: string } | null)?.started_at ?? row.logged_at;
    const entry = bySession.get(row.session_id) ?? {
      sessionId: row.session_id,
      date: startedAt,
      sets: [],
      topWeightKg: 0,
      volumeKg: 0,
    };
    entry.sets.push({ weight_kg: row.weight_kg, reps: row.reps, rpe: row.rpe });
    entry.topWeightKg = Math.max(entry.topWeightKg, Number(row.weight_kg ?? 0));
    entry.volumeKg += Number(row.weight_kg ?? 0) * (row.reps ?? 0);
    bySession.set(row.session_id, entry);
  }

  return [...bySession.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
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
