import type { ImportedWorkout, LocalDateTime, WorkoutPayload } from "./types";

/**
 * Turning parsed workouts into what the server action receives: real instants,
 * library exercise ids, and batches small enough to send.
 */

/**
 * When a file doesn't say how long a workout took, it is recorded as an hour.
 * Every imported session needs an end — an open one would collide with the
 * one-session-in-progress rule and show up as a workout still running — and an
 * hour is a typical session, so durations and weekly totals stay believable.
 */
export const DEFAULT_DURATION_S = 3600;
/** Longer than this is a forgotten stopwatch, not a workout. */
const MAX_DURATION_S = 12 * 3600;

/**
 * A wall-clock moment read as local time in this browser. The person importing
 * is almost always in the zone they trained in, and the exports carry no zone
 * of their own to prefer.
 */
export function localToDate({ date, time }: LocalDateTime): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  return new Date(y, mo - 1, d, h, mi);
}

/** Two sessions that start in the same minute are the same session. */
export function minuteKey(instant: string | Date): string {
  return new Date(instant).toISOString().slice(0, 16);
}

export function sessionTimes(workout: Pick<ImportedWorkout, "start" | "durationS">) {
  const started = localToDate(workout.start);
  const duration =
    workout.durationS && workout.durationS > 0 && workout.durationS <= MAX_DURATION_S
      ? workout.durationS
      : DEFAULT_DURATION_S;
  return { startedAt: started.toISOString(), endedAt: new Date(started.getTime() + duration * 1000).toISOString() };
}

/**
 * Resolves each exercise to a library id through `resolve` (null = the lifter
 * chose to skip it) and drops workouts left with nothing in them. Workouts the
 * file gives no name (FitNotes never does) get `fallbackTitle`, so the session
 * list says where they came from rather than a bare "Session".
 */
export function toPayloads(
  workouts: ImportedWorkout[],
  resolve: (exerciseName: string) => string | null,
  fallbackTitle: string | null = null,
): WorkoutPayload[] {
  const payloads: WorkoutPayload[] = [];
  for (const workout of workouts) {
    const exercises = workout.exercises
      .map((e) => ({ exerciseId: resolve(e.name), sets: e.sets }))
      .filter((e): e is { exerciseId: string; sets: typeof e.sets } => e.exerciseId !== null && e.sets.length > 0);
    if (exercises.length === 0) continue;
    payloads.push({
      ...sessionTimes(workout),
      title: (workout.title ?? fallbackTitle)?.slice(0, 120) ?? null,
      notes: workout.notes?.slice(0, 2000) ?? null,
      exercises,
    });
  }
  return payloads;
}

/**
 * Server Actions accept 1 MB by default. A set is about 80 bytes of JSON, so
 * capping both the workouts and the sets per call keeps every batch far below
 * that, even for someone who logs forty sets a session.
 */
export function chunkPayloads(
  payloads: WorkoutPayload[],
  { maxWorkouts = 100, maxSets = 3000 }: { maxWorkouts?: number; maxSets?: number } = {},
): WorkoutPayload[][] {
  const batches: WorkoutPayload[][] = [];
  let current: WorkoutPayload[] = [];
  let sets = 0;
  for (const payload of payloads) {
    const size = payload.exercises.reduce((n, e) => n + e.sets.length, 0);
    if (current.length > 0 && (current.length >= maxWorkouts || sets + size > maxSets)) {
      batches.push(current);
      current = [];
      sets = 0;
    }
    current.push(payload);
    sets += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
