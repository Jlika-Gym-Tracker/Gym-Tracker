"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database, Tracking } from "@/lib/database.types";
import type { LibraryExercise } from "@/lib/program/match";
import { getLibrary } from "@/lib/program/queries";
import { EQUIPMENT, MUSCLES, TRACKING } from "@/lib/import/guess";
import type { BodyWeightEntry, WorkoutPayload } from "@/lib/import/types";

/**
 * Writing an imported history.
 *
 * The file is parsed and reviewed in the browser; these only ever receive the
 * reviewed, converted result, a batch at a time. Every batch stands alone and
 * re-checks what it is given, so a dropped connection halfway through leaves a
 * clean prefix of the history, and running the import again picks up the rest
 * without duplicating anything.
 */

type Result<T> = ({ error?: undefined } & T) | { error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, user };
}

function fail(error: unknown): { error: string } {
  if (error instanceof z.ZodError) {
    return { error: "Part of this import didn't check out. Reload the page and pick the file again." };
  }
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

/** PostgREST hands back at most 1,000 rows a request; a long history has more. */
const PAGE = 1000;

/** Two sessions that start in the same minute are the same session. */
const minuteKey = (instant: string) => new Date(instant).toISOString().slice(0, 16);

export type ImportLibraryExercise = LibraryExercise & { tracking: Tracking; own: boolean };

/**
 * The library to match names against: every global exercise plus the caller's
 * own, without the ones they removed — the same read the builder uses, paged
 * past Supabase's 1000-row cap and carrying `featured`, so an imported
 * "Bench Press" lands on the curated row rather than an obscure variant.
 */
export async function getImportLibrary(): Promise<Result<{ library: ImportLibraryExercise[] }>> {
  try {
    const { user } = await requireUser();
    const rows = await getLibrary();
    return {
      library: rows.map((exercise) => ({
        ...exercise,
        tracking: exercise.tracking ?? "reps",
        own: exercise.owner_id === user.id,
      })),
    };
  } catch (error) {
    return fail(error);
  }
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Start minutes of this account's sessions from `from` up to a minute past `to`. */
async function loggedStarts(supabase: Client, userId: string, from: string, to: string): Promise<Set<string>> {
  // A minute past the last start, so a session at hh:mm:30 still counts.
  const until = new Date(new Date(to).getTime() + 60_000).toISOString();
  const starts = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("started_at")
      .eq("user_id", userId)
      .gte("started_at", from)
      .lt("started_at", until)
      .order("started_at")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) starts.add(minuteKey(row.started_at));
    if (!data || data.length < PAGE) break;
  }
  return starts;
}

const rangeSchema = z.object({ from: z.iso.datetime(), to: z.iso.datetime() });

/**
 * Start minutes of the sessions already logged between two instants, so the
 * review step can say how many workouts a re-import will skip.
 */
export async function findLoggedStarts(from: string, to: string): Promise<Result<{ starts: string[] }>> {
  try {
    const { supabase, user } = await requireUser();
    const range = rangeSchema.parse({ from, to });
    return { starts: [...(await loggedStarts(supabase, user.id, range.from, range.to))] };
  } catch (error) {
    return fail(error);
  }
}

const exerciseSpecSchema = z.object({
  name: z.string().trim().min(1).max(120),
  primaryMuscle: z.enum(MUSCLES),
  equipment: z.enum(EQUIPMENT),
  tracking: z.enum(TRACKING),
});

export type ExerciseSpec = z.input<typeof exerciseSpecSchema>;

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "exercise"
  );
}

/**
 * Creates the exercises the lifter chose to add as their own, once, before any
 * workout is sent. An own exercise with the same name is reused rather than
 * duplicated, which is what makes importing the same file twice harmless.
 *
 * Returns the id for each requested name, and how many were new.
 */
export async function createImportExercises(
  specs: ExerciseSpec[],
): Promise<Result<{ ids: Record<string, string>; created: number }>> {
  try {
    const { supabase, user } = await requireUser();
    const input = z.array(exerciseSpecSchema).max(500).parse(specs);
    if (input.length === 0) return { ids: {}, created: 0 };
    let created = 0;

    const { data: own, error: ownError } = await supabase
      .from("exercises")
      .select("id, name, slug")
      .eq("owner_id", user.id);
    if (ownError) throw ownError;

    const byName = new Map((own ?? []).map((e) => [e.name.trim().toLowerCase(), e.id]));
    const takenSlugs = new Set((own ?? []).map((e) => e.slug));
    const ids: Record<string, string> = {};

    // Slugs are unique across every account, so an own exercise's carries the
    // owner's id. The suffix only matters for two names that slugify alike.
    const prefix = `u-${user.id.slice(0, 8)}-`;
    const slugFor = (name: string) => {
      const base = prefix + slugify(name);
      let slug = base;
      for (let n = 2; takenSlugs.has(slug); n++) slug = `${base}-${n}`;
      takenSlugs.add(slug);
      return slug;
    };

    for (const spec of input) {
      const existing = byName.get(spec.name.toLowerCase());
      if (existing) {
        ids[spec.name] = existing;
        continue;
      }

      let id: string | null = null;
      for (let attempt = 0; attempt < 3 && !id; attempt++) {
        // On a clash with a slug this account can't see (another lifter whose
        // id starts the same way), retry with a random tail.
        const slug = attempt === 0 ? slugFor(spec.name) : `${slugFor(spec.name)}-${crypto.randomUUID().slice(0, 6)}`;
        const row: Database["public"]["Tables"]["exercises"]["Insert"] = {
          owner_id: user.id,
          slug,
          name: spec.name,
          primary_muscle: spec.primaryMuscle,
          equipment: spec.equipment,
          tracking: spec.tracking,
        };
        const { data, error } = await supabase
          .from("exercises")
          .insert(row)
          .select("id")
          .single();
        if (!error) id = data.id;
        else if (error.code !== "23505") throw error;
      }
      if (!id) return { error: `Couldn't add “${spec.name}” to your library. Try the import again.` };
      ids[spec.name] = id;
      byName.set(spec.name.toLowerCase(), id);
      created++;
    }

    if (created > 0) revalidatePath("/program");
    return { ids, created };
  } catch (error) {
    return fail(error);
  }
}

const setSchema = z.object({
  weightKg: z.number().min(0).max(1500).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  durationS: z.number().int().min(0).max(86_400).nullable(),
  distanceM: z.number().min(0).max(1_000_000).nullable(),
});

const workoutSchema = z
  .object({
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    title: z.string().max(120).nullable(),
    notes: z.string().max(2000).nullable(),
    exercises: z
      // Generous on purpose: the batch's set total below is the real bound.
      .array(z.object({ exerciseId: z.uuid(), sets: z.array(setSchema).min(1).max(2000) }))
      .min(1)
      .max(300),
    // Only a JLIKA backup has these; the apps' exports never do.
    rating: z.number().int().min(1).max(3).nullable().optional(),
    bodyweightKg: z.number().min(20).max(400).nullable().optional(),
  })
  .refine((w) => new Date(w.endedAt) > new Date(w.startedAt), "A session has to end after it starts.");

/** Matches the client's batching: 100 workouts and a few thousand sets fit well inside 1 MB. */
const batchSchema = z.array(workoutSchema).min(1).max(100);
const MAX_SETS_PER_BATCH = 6000;
const INSERT_CHUNK = 1000;

export type BatchResult = { imported: number; skipped: number; sets: number };

/**
 * Writes one batch of reviewed workouts.
 *
 * A workout whose start minute already has a session is skipped — that is the
 * whole of the duplicate check, and it is what lets the same file be imported
 * twice. Every session is written finished (ended_at set): an open one would
 * trip the one-session-in-progress rule and read as a workout still running.
 */
export async function importWorkoutBatch(workouts: WorkoutPayload[]): Promise<Result<BatchResult>> {
  try {
    const { supabase, user } = await requireUser();
    const batch = batchSchema.parse(workouts);
    const totalSets = batch.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
    if (totalSets > MAX_SETS_PER_BATCH) return { error: "That batch was too big to send. Reload and try again." };

    // The foreign key would accept any exercise id; RLS on the read decides
    // which ones this account may actually log against.
    const exerciseIds = [...new Set(batch.flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
    const { data: visible, error: visibleError } = await supabase
      .from("exercises")
      .select("id")
      .in("id", exerciseIds);
    if (visibleError) throw visibleError;
    if ((visible ?? []).length !== exerciseIds.length) {
      return { error: "Some exercises in this import are no longer in your library. Go back and review the matches." };
    }

    const starts = batch.map((w) => new Date(w.startedAt).getTime());
    const taken = await loggedStarts(
      supabase,
      user.id,
      new Date(Math.min(...starts)).toISOString(),
      new Date(Math.max(...starts)).toISOString(),
    );

    const fresh: typeof batch = [];
    for (const workout of batch) {
      const key = minuteKey(workout.startedAt);
      if (taken.has(key)) continue;
      taken.add(key);
      fresh.push(workout);
    }
    if (fresh.length === 0) return { imported: 0, skipped: batch.length, sets: 0 };

    const { data: sessions, error: sessionError } = await supabase
      .from("workout_sessions")
      .insert(
        fresh.map((w) => ({
          user_id: user.id,
          title: w.title,
          notes: w.notes,
          started_at: w.startedAt,
          ended_at: w.endedAt,
          rating: w.rating ?? null,
          bodyweight_kg: w.bodyweightKg ?? null,
        })),
      )
      .select("id, started_at");
    if (sessionError) throw sessionError;
    const sessionByMinute = new Map((sessions ?? []).map((s) => [minuteKey(s.started_at), s.id]));

    const rows = fresh.flatMap((workout) => {
      const sessionId = sessionByMinute.get(minuteKey(workout.startedAt));
      if (!sessionId) return [];
      const start = new Date(workout.startedAt).getTime();

      // A file can list one exercise twice in a workout, and two spellings can
      // map to the same library row. Either way its sets continue one count,
      // since (session, exercise, set_index) is unique.
      const nextIndex = new Map<string, number>();
      let order = 0;
      return workout.exercises.flatMap(({ exerciseId, sets }) =>
        sets.map((set) => {
          const setIndex = nextIndex.get(exerciseId) ?? 0;
          nextIndex.set(exerciseId, setIndex + 1);
          return {
            session_id: sessionId,
            exercise_id: exerciseId,
            set_index: setIndex,
            weight_kg: set.weightKg,
            reps: set.reps,
            rpe: set.rpe,
            duration_s: set.durationS,
            distance_m: set.distanceM,
            is_complete: true,
            // History and the progression hint order by logged_at; stamping the
            // import time would make a 2019 squat look like yesterday's. A second
            // apart keeps the file's order.
            logged_at: new Date(start + order++ * 1000).toISOString(),
          };
        }),
      );
    });

    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error } = await supabase.from("set_logs").insert(rows.slice(i, i + INSERT_CHUNK));
      if (error) {
        // Take the batch's sessions back out (their sets cascade), so a retry
        // finds nothing half-written to skip.
        await supabase.from("workout_sessions").delete().in("id", [...sessionByMinute.values()]);
        throw error;
      }
    }

    revalidatePath("/", "layout");
    return { imported: fresh.length, skipped: batch.length - fresh.length, sets: rows.length };
  } catch (error) {
    return fail(error);
  }
}

const weightsSchema = z
  .array(z.object({ date: z.iso.date(), weightKg: z.number().gt(0).lt(400) }))
  .min(1)
  .max(2000);

export type WeightsResult = { added: number; filled: number; kept: number };

/**
 * Body weights from Apple Health, one per day.
 *
 * A day that already has a weight keeps it — the one typed into this app is the
 * one the lifter chose to record. A day with only measurements (waist, arms…)
 * gets the weight added beside them.
 */
export async function importBodyWeights(entries: BodyWeightEntry[]): Promise<Result<WeightsResult>> {
  try {
    const { supabase, user } = await requireUser();
    const input = weightsSchema.parse(entries);
    const dates = input.map((e) => e.date).sort();

    const existing = new Map<string, number | null>();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("body_metrics")
        .select("measured_on, weight_kg")
        .eq("user_id", user.id)
        .gte("measured_on", dates[0]!)
        .lte("measured_on", dates.at(-1)!)
        .order("measured_on")
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      for (const row of data ?? []) existing.set(row.measured_on, row.weight_kg);
      if (!data || data.length < PAGE) break;
    }

    const fresh = input.filter((e) => !existing.has(e.date));
    const fill = input.filter((e) => existing.has(e.date) && existing.get(e.date) == null);

    const rowsFor = (list: typeof input) =>
      list.map((e) => ({ user_id: user.id, measured_on: e.date, weight_kg: Math.round(e.weightKg * 100) / 100 }));

    if (fresh.length) {
      // ignoreDuplicates: a weigh-in logged in another tab a moment ago wins.
      const { error } = await supabase
        .from("body_metrics")
        .upsert(rowsFor(fresh), { onConflict: "user_id,measured_on", ignoreDuplicates: true });
      if (error) throw error;
    }
    if (fill.length) {
      // Merging writes only the columns sent, so the day's measurements stay.
      const { error } = await supabase
        .from("body_metrics")
        .upsert(rowsFor(fill), { onConflict: "user_id,measured_on" });
      if (error) throw error;
    }

    revalidatePath("/progress");
    revalidatePath("/", "layout");
    return { added: fresh.length, filled: fill.length, kept: input.length - fresh.length - fill.length };
  } catch (error) {
    return fail(error);
  }
}
