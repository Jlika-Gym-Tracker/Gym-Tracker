import "server-only";
import { parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import type { Tracking } from "@/lib/database.types";
import type { PreviousBest } from "./records";
import {
  foldBests,
  monthOf,
  monthRange,
  recordCounts,
  type MonthSession,
  type MonthSet,
  type RecordSession,
} from "./history";

/**
 * The reads behind /history and a finished session's records.
 *
 * Every one filters to the signed-in user explicitly. A coach's RLS also lets
 * them read their athletes' sessions, and those must never turn up in the
 * coach's own history or set the bar for the coach's own records.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

async function viewer(): Promise<{ supabase: Client; me: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, me: user?.id ?? null };
}

/** Supabase caps a response at 1000 rows; years of sets are many times that. */
const PAGE = 1000;

type Page<T> = { data: T[] | null; error: unknown; count?: number | null };

/**
 * Every row a query matches. The first page asks for the total so the rest
 * can be fetched side by side rather than one after another.
 */
async function readAll<T>(
  run: (from: number, to: number, count: boolean) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const first = await run(0, PAGE - 1, true);
  if (first.error) throw first.error;
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  if (rows.length === 0 || rows.length >= total) return rows;

  // Sized by what the first page returned, in case the server's cap is lower.
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

const num = (value: number | string | null) => (value == null ? null : Number(value));

export type HistoryMonthData = {
  sessions: MonthSession[];
  /** Completed sets of those sessions. */
  sets: MonthSet[];
  /** The nearest month before this one with a finished session, if any. */
  earlier: string | null;
  /** The nearest month after this one with a finished session, if any. */
  later: string | null;
  /** Finished sessions ever, so an empty month can tell "rest" from "nothing yet". */
  total: number;
};

/**
 * One month of finished sessions, their completed sets, and where the
 * neighbouring training is — so paging past a quiet stretch is one tap, not
 * one per empty month.
 */
export async function getHistoryMonth(month: string): Promise<HistoryMonthData> {
  const { supabase, me } = await viewer();
  if (!me) return { sessions: [], sets: [], earlier: null, later: null, total: 0 };
  const { start, end } = monthRange(month);
  const from = start.toISOString();
  const until = end.toISOString();

  const finished = () =>
    supabase.from("workout_sessions").select("started_at").eq("user_id", me).not("ended_at", "is", null);

  const [sessions, before, after, count] = await Promise.all([
    readAll((lo, hi, withCount) =>
      supabase
        .from("workout_sessions")
        .select("id, title, started_at, ended_at", withCount ? { count: "exact" } : undefined)
        .eq("user_id", me)
        .not("ended_at", "is", null)
        .gte("started_at", from)
        .lt("started_at", until)
        .order("started_at")
        .order("id")
        .range(lo, hi),
    ),
    finished().lt("started_at", from).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    finished().gte("started_at", until).order("started_at").limit(1).maybeSingle(),
    supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", me)
      .not("ended_at", "is", null),
  ]);

  const ids = sessions.map((s) => s.id);
  const sets = ids.length
    ? await readAll((lo, hi, withCount) =>
        supabase
          .from("set_logs")
          .select(
            "session_id, exercise_id, weight_kg, reps, duration_s, exercise:exercises ( tracking )",
            withCount ? { count: "exact" } : undefined,
          )
          // These ids are already this user's own sessions.
          .in("session_id", ids)
          .eq("is_complete", true)
          .order("id")
          .range(lo, hi),
      )
    : [];

  // lib/database.types.ts declares no Relationships, so the embed cannot be
  // inferred. Cast at the boundary, once.
  type SetRow = {
    session_id: string;
    exercise_id: string;
    weight_kg: number | string | null;
    reps: number | null;
    duration_s: number | null;
    exercise: { tracking: Tracking | null } | null;
  };

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      startedAt: s.started_at,
      endedAt: s.ended_at!,
    })),
    sets: (sets as unknown as SetRow[]).map((s) => ({
      sessionId: s.session_id,
      exerciseId: s.exercise_id,
      tracking: s.exercise?.tracking ?? "reps",
      weightKg: num(s.weight_kg),
      reps: s.reps,
      durationS: s.duration_s,
    })),
    earlier: before.data ? monthOf(parseISO(before.data.started_at)) : null,
    later: after.data ? monthOf(parseISO(after.data.started_at)) : null,
    total: count.count ?? 0,
  };
}

type BestRow = {
  session_id: string;
  exercise_id: string;
  weight_kg: number | string | null;
  reps: number | null;
  duration_s: number | null;
  session: { started_at: string };
};

/**
 * Completed sets of these movements from every session that started before
 * `before`. Only the movements asked about, so the read grows with how often
 * you trained them rather than with your whole log.
 */
async function setsBefore(
  supabase: Client,
  me: string,
  exerciseIds: string[],
  before: string,
  excludeSessionId?: string,
): Promise<BestRow[]> {
  const rows = await readAll((lo, hi, withCount) => {
    let query = supabase
      .from("set_logs")
      .select(
        "session_id, exercise_id, weight_kg, reps, duration_s, session:workout_sessions!inner ( started_at, user_id )",
        withCount ? { count: "exact" } : undefined,
      )
      .eq("session.user_id", me)
      .lt("session.started_at", before)
      .in("exercise_id", exerciseIds)
      .eq("is_complete", true);
    if (excludeSessionId) query = query.neq("session_id", excludeSessionId);
    return query.order("id").range(lo, hi);
  });
  return rows as unknown as BestRow[];
}

/**
 * How many records each of a month's sessions set, judged against everything
 * that started before it. Separate from getHistoryMonth because it reads far
 * more, so the page can show the month first and stream these in.
 */
export async function getMonthRecordCounts(
  month: string,
  sets: MonthSet[],
): Promise<Record<string, number>> {
  // Cardio never sets a record, so its history is not worth reading.
  const tracking = new Map<string, Tracking>();
  for (const set of sets) if (set.tracking !== "cardio") tracking.set(set.exerciseId, set.tracking);
  if (tracking.size === 0) return {};

  const { supabase, me } = await viewer();
  if (!me) return {};
  const monthSessions = new Set(sets.map((s) => s.sessionId));
  const rows = await setsBefore(supabase, me, [...tracking.keys()], monthRange(month).end.toISOString());

  const sessions = new Map<string, RecordSession>();
  for (const row of rows) {
    let session = sessions.get(row.session_id);
    if (!session) {
      session = { id: row.session_id, startedAt: row.session.started_at, sets: [] };
      sessions.set(row.session_id, session);
    }
    session.sets.push({
      sessionId: row.session_id,
      exerciseId: row.exercise_id,
      tracking: tracking.get(row.exercise_id) ?? "reps",
      weightKg: num(row.weight_kg),
      reps: row.reps,
      durationS: row.duration_s,
    });
  }

  const counts = recordCounts([...sessions.values()]);
  return Object.fromEntries([...counts].filter(([id]) => monthSessions.has(id)));
}

/**
 * All-time bests per movement from sessions that started before `before` —
 * the bar a finished session's sets are judged against. Reading only what came
 * before keeps an old session's records true after later ones beat them.
 */
export async function getBestsBefore(
  exerciseIds: string[],
  before: string,
  { excludeSessionId }: { excludeSessionId?: string } = {},
): Promise<Map<string, PreviousBest>> {
  const bests = new Map<string, PreviousBest>();
  if (exerciseIds.length === 0) return bests;
  const { supabase, me } = await viewer();
  if (!me) return bests;
  const rows = await setsBefore(supabase, me, exerciseIds, before, excludeSessionId);
  foldBests(
    bests,
    rows.map((r) => ({
      exerciseId: r.exercise_id,
      weightKg: num(r.weight_kg),
      reps: r.reps,
      durationS: r.duration_s,
    })),
  );
  return bests;
}

/** Whether this session is the signed-in user's own — a coach may only read it. */
export async function isOwnSession(sessionId: string): Promise<boolean> {
  const { supabase, me } = await viewer();
  if (!me) return false;
  const { data } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", me)
    .maybeSingle();
  return !!data;
}
