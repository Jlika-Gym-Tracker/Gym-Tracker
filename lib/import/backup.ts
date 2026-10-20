import { format } from "date-fns";
import { DEFAULT_DURATION_S } from "./batches";
import { EQUIPMENT, MUSCLES, TRACKING } from "./guess";
import { parseHistoryCsv, type ParseOptions } from "./workouts";
import { blobSource, listZipEntries, streamZipEntry } from "./zip";
import type {
  BodyWeightEntry, ExerciseRef, ExerciseSummary, ImportedExercise, ImportedSet, ImportedWorkout,
  ImportIssue, ParseResult,
} from "./types";

/**
 * Reads a JLIKA Gym account export — the JSON from Profile → Data & privacy →
 * Download JSON (/api/export?format=json), or the export.json inside the ZIP —
 * back into the importer's workouts → exercises → sets, so a backup goes
 * through the same review and the same idempotent batches as a Strong file.
 *
 * What comes back, and how it is matched:
 *   sessions        by start time to the minute, so restoring twice adds nothing
 *   your exercises  by name, else added back to your library as your own
 *   library ones    by id (the same on this server), else by slug if the file names one
 *   body weights    one per day, never over a day that already has a weight
 *
 * Everything else in the file (photos, meal plans, crew, settings, the
 * program) is left alone, and the review step says so.
 */

/** The same limits the CSV reader and the server apply. */
const MAX_WEIGHT_KG = 1500;
const MAX_REPS = 1000;
const MAX_DURATION_S = 86_400;
const MAX_DISTANCE_M = 1_000_000;
const MAX_ISSUES = 50;

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const rowsOf = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
const textOf = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Postgres numerics can arrive as strings; anything else unreadable is null. */
function numberOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function instantOf(value: unknown): Date | null {
  const raw = textOf(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const round = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** JSON, not CSV: the importer's cue to read the file as a backup. */
export function looksLikeJson(text: string): boolean {
  return /^\s*[{[]/.test(text.replace(/^﻿/, ""));
}

/** Reads any file the history importer accepts as text: a backup, or an app's CSV. */
export function parseHistoryFile(text: string, options: ParseOptions): ParseResult {
  return looksLikeJson(text) ? parseBackupJson(text) : parseHistoryCsv(text, options);
}

/** The export ZIP's JSON, or null when the ZIP holds no export.json (an Apple Health one, say). */
export async function readBackupFromZip(file: Blob): Promise<string | null> {
  const source = blobSource(file);
  const entry = (await listZipEntries(source)).find((e) => /(^|\/)export\.json$/i.test(e.name));
  if (!entry) return null;
  const decoder = new TextDecoder();
  let text = "";
  await streamZipEntry(source, entry, (bytes) => {
    text += decoder.decode(bytes, { stream: true });
  });
  return text + decoder.decode();
}

type Gathered = { set: ImportedSet; index: number; loggedAt: string };

export function parseBackupJson(raw: string): ParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(raw.replace(/^﻿/, ""));
  } catch {
    return { ok: false, error: "This file isn't readable JSON — it may have been cut short. Download the export again." };
  }
  if (!isRow(doc) || !Array.isArray(doc.workout_sessions) || !Array.isArray(doc.set_logs)) {
    return {
      ok: false,
      error: "This JSON isn't a JLIKA Gym export. Use the file from Profile → Data & privacy → Download JSON.",
    };
  }

  const issues: ImportIssue[] = [];
  let issueCount = 0;
  const issue = (message: string) => {
    issueCount++;
    if (issues.length < MAX_ISSUES) issues.push({ row: issueCount, message });
  };

  // The export reads through RLS, which also lets a coach see their athletes'
  // sessions. Only the account's own rows are its history.
  const account = isRow(doc.account) ? textOf(doc.account.id) : null;
  const mine = (row: Row) => !account || !textOf(row.user_id) || row.user_id === account;

  // ── Sessions ─────────────────────────────────────────────────────────────
  const sessions = new Map<string, { row: Row; started: Date; ended: Date | null }>();
  const othersSessions = new Set<string>();
  for (const [i, row] of rowsOf(doc.workout_sessions).entries()) {
    const id = textOf(row.id);
    const started = instantOf(row.started_at);
    if (!id || !started) {
      issue(`Session ${i + 1} has no start time we could read — skipped.`);
      continue;
    }
    if (!mine(row)) {
      othersSessions.add(id);
      continue;
    }
    sessions.set(id, { row, started, ended: instantOf(row.ended_at) });
  }

  // ── Exercises the file describes ─────────────────────────────────────────
  // custom_exercises is the account's own; `exercises`, should a file carry
  // the library rows too, is read the same way. owner_id tells them apart.
  const described = new Map<string, Row>();
  for (const row of [...rowsOf(doc.exercises), ...rowsOf(doc.custom_exercises)]) {
    const id = textOf(row.id);
    if (id) described.set(id, row);
  }

  const refOf = (exerciseId: string): { name: string; ref: ExerciseRef } => {
    const row = described.get(exerciseId);
    const name = row ? textOf(row.name)?.replace(/\s+/g, " ").slice(0, 120) : null;
    if (row && textOf(row.owner_id) && name) {
      return {
        name,
        ref: {
          kind: "own",
          name,
          primaryMuscle: oneOf(MUSCLES, row.primary_muscle, "chest"),
          equipment: oneOf(EQUIPMENT, row.equipment, "other"),
          tracking: oneOf(TRACKING, row.tracking, "reps"),
        },
      };
    }
    return {
      // Shown only until the review step finds it in the library by id.
      name: name ?? `Library exercise ${exerciseId.slice(0, 8)}`,
      ref: { kind: "library", id: exerciseId, slug: row ? textOf(row.slug) : null },
    };
  };

  // ── Sets ─────────────────────────────────────────────────────────────────
  const bySession = new Map<string, Map<string, Gathered[]>>();
  let untickedSkipped = 0;
  let emptySkipped = 0;
  let setCount = 0;
  for (const [i, row] of rowsOf(doc.set_logs).entries()) {
    const label = `Set ${i + 1}`;
    const sessionId = textOf(row.session_id);
    const exerciseId = textOf(row.exercise_id);
    if (sessionId && othersSessions.has(sessionId)) continue;
    if (!sessionId || !sessions.has(sessionId)) {
      issue(`${label} belongs to a session that isn't in the file — skipped.`);
      continue;
    }
    if (!exerciseId) {
      issue(`${label} has no exercise — skipped.`);
      continue;
    }
    // Nothing reads an unticked set — not records, volume or progression —
    // so leaving them out loses nothing.
    if (row.is_complete !== true) {
      untickedSkipped++;
      continue;
    }
    const set = readSet(row, label, issue);
    if (!set) {
      emptySkipped++;
      continue;
    }
    const exercises = bySession.get(sessionId) ?? new Map<string, Gathered[]>();
    const list = exercises.get(exerciseId) ?? [];
    list.push({ set, index: numberOf(row.set_index) ?? list.length, loggedAt: textOf(row.logged_at) ?? "" });
    exercises.set(exerciseId, list);
    bySession.set(sessionId, exercises);
    setCount++;
  }

  // ── Workouts ─────────────────────────────────────────────────────────────
  const refs = new Map<string, { name: string; ref: ExerciseRef }>();
  const refFor = (id: string) => {
    let found = refs.get(id);
    if (!found) {
      found = refOf(id);
      refs.set(id, found);
    }
    return found;
  };
  const keyOf = (exerciseId: string) => `id:${exerciseId}`;

  const workouts: ImportedWorkout[] = [];
  const ordered = [...sessions.entries()].sort(([, a], [, b]) => a.started.getTime() - b.started.getTime());
  for (const [id, { row, started, ended }] of ordered) {
    const gathered = bySession.get(id);
    // A session with nothing ticked off left nothing behind to restore.
    if (!gathered) continue;

    const exercises: ImportedExercise[] = [...gathered.entries()]
      .map(([exerciseId, list]) => ({
        exerciseId,
        list: [...list].sort((a, b) => a.index - b.index),
        // Movements in the order they were first logged.
        first: list.reduce((min, s) => (s.loggedAt && s.loggedAt < min ? s.loggedAt : min), "￿"),
      }))
      .sort((a, b) => a.first.localeCompare(b.first))
      .map(({ exerciseId, list }) => ({
        name: refFor(exerciseId).name,
        key: keyOf(exerciseId),
        sets: list.map((s) => s.set),
      }));

    const end = ended && ended > started ? ended : null;
    const rating = numberOf(row.rating);
    const bodyweight = numberOf(row.bodyweight_kg);
    workouts.push({
      start: { date: format(started, "yyyy-MM-dd"), time: format(started, "HH:mm") },
      timeStated: true,
      durationS: end ? Math.round((end.getTime() - started.getTime()) / 1000) : null,
      title: textOf(row.title)?.slice(0, 120) ?? null,
      notes: textOf(row.notes)?.slice(0, 2000) ?? null,
      exercises,
      exact: {
        startedAt: started.toISOString(),
        // Still running when exported: saved as an hour, like an import that
        // doesn't say how long it took.
        endedAt: (end ?? new Date(started.getTime() + DEFAULT_DURATION_S * 1000)).toISOString(),
      },
      rating: rating != null && Number.isInteger(rating) && rating >= 1 && rating <= 3 ? rating : null,
      bodyweightKg: bodyweight != null && bodyweight >= 20 && bodyweight <= 400 ? round(bodyweight, 2) : null,
    });
  }

  // ── What the review step lists ───────────────────────────────────────────
  const summaries = new Map<string, ExerciseSummary & { seenIn: Set<number> }>();
  for (const [w, workout] of workouts.entries()) {
    for (const exercise of workout.exercises) {
      const exerciseId = exercise.key!.slice(3);
      let summary = summaries.get(exercise.key!);
      if (!summary) {
        const { name, ref } = refFor(exerciseId);
        summary = {
          name,
          key: exercise.key,
          ref,
          category: null,
          sets: 0,
          workouts: 0,
          hasReps: false,
          hasWeight: false,
          hasDuration: false,
          hasDistance: false,
          seenIn: new Set(),
        };
        summaries.set(exercise.key!, summary);
      }
      summary.seenIn.add(w);
      for (const set of exercise.sets) {
        summary.sets++;
        summary.hasReps ||= set.reps != null;
        summary.hasWeight ||= set.weightKg != null;
        summary.hasDuration ||= set.durationS != null;
        summary.hasDistance ||= set.distanceM != null;
      }
    }
  }
  const exercises: ExerciseSummary[] = [...summaries.values()]
    .map(({ seenIn, ...summary }) => ({ ...summary, workouts: seenIn.size }))
    .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));

  // ── Body weight ──────────────────────────────────────────────────────────
  const weights = new Map<string, number>();
  let measurements = false;
  for (const row of rowsOf(doc.body_metrics)) {
    if (!mine(row)) continue;
    const date = textOf(row.measured_on);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const weight = numberOf(row.weight_kg);
    if (weight != null && weight > 0 && weight < 400) weights.set(date, round(weight, 2));
    if (["waist_cm", "chest_cm", "arm_cm", "thigh_cm", "hip_cm", "bodyfat_pct"].some((k) => numberOf(row[k]) != null)) {
      measurements = true;
    }
  }
  const bodyWeights: BodyWeightEntry[] = [...weights.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, weightKg]) => ({ date, weightKg }));

  // ── What stays behind ────────────────────────────────────────────────────
  const has = (...keys: string[]) =>
    keys.some((key) => {
      const value = doc[key];
      return Array.isArray(value) ? value.length > 0 : isRow(value);
    });
  const ignored: string[] = [];
  if (has("progress_photos")) ignored.push("progress photos");
  if (has("meal_plans", "meal_plan_entries", "grocery_items")) ignored.push("meal plans and groceries");
  if (has("crew_links")) ignored.push("crew");
  if (has("program_weeks", "program_days")) ignored.push("your program");
  if (has("profile", "user_settings", "sharing_prefs", "user_excludes")) ignored.push("profile and settings");
  if (measurements) ignored.push("body measurements other than weight");
  if (othersSessions.size > 0) {
    ignored.push(`${othersSessions.size} ${othersSessions.size === 1 ? "session" : "sessions"} of athletes you coach`);
  }

  return {
    ok: true,
    history: {
      format: "jlika",
      workouts,
      exercises,
      setCount,
      warmupsSkipped: 0,
      emptySkipped,
      issues,
      issueCount,
      unitsStated: true,
      from: workouts[0]?.start.date ?? null,
      to: workouts.at(-1)?.start.date ?? null,
      bodyWeights,
      untickedSkipped,
      ignored,
    },
  };
}

/** One logged set's measurements, checked. Null when it measured nothing at all. */
function readSet(row: Row, label: string, issue: (message: string) => void): ImportedSet | null {
  // Unlike the apps' CSVs, a zero here was typed into this app and means zero.
  const checked = (key: string, max: number, what: string, integer = false) => {
    const value = numberOf(row[key]);
    if (value == null) return null;
    if (value < 0 || value > max) {
      issue(`${label} has ${what} we can't use (${value}) — imported without it.`);
      return null;
    }
    return integer ? Math.round(value) : value;
  };

  const rpe = numberOf(row.rpe);
  const distance = checked("distance_m", MAX_DISTANCE_M, "a distance");
  const set: ImportedSet = {
    weightKg: (() => {
      const value = checked("weight_kg", MAX_WEIGHT_KG, "a weight");
      return value == null ? null : round(value, 2);
    })(),
    reps: checked("reps", MAX_REPS, "a rep count", true),
    rpe: rpe != null && rpe >= 1 && rpe <= 10 ? round(rpe, 1) : null,
    durationS: checked("duration_s", MAX_DURATION_S, "a time", true),
    distanceM: distance == null ? null : round(distance, 1),
  };
  if (set.weightKg == null && set.reps == null && set.durationS == null && set.distanceM == null) return null;
  return set;
}
