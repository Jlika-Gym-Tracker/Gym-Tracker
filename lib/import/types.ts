/**
 * The one shape every training-history export is read into, whichever app it
 * came from: workouts → exercises → sets.
 *
 * Weights are already kg and distances metres by the time anything lands here,
 * so nothing downstream has to know that Hevy wrote miles or FitNotes wrote lbs
 * on every other row.
 */

import type { Equipment, Muscle, Tracking } from "@/lib/database.types";

export type ImportFormat = "strong" | "hevy" | "fitnotes-android" | "fitnotes-ios" | "jlika";

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  strong: "Strong",
  hevy: "Hevy",
  "fitnotes-android": "FitNotes (Android)",
  "fitnotes-ios": "FitNotes (iOS)",
  jlika: "JLIKA backup",
};

/**
 * A moment as the file wrote it: a calendar date and a wall-clock time, with no
 * time zone. None of these apps write one, and the person importing is almost
 * always in the zone they trained in, so the browser turns it into an instant.
 */
export type LocalDateTime = {
  /** yyyy-MM-dd */
  date: string;
  /** HH:mm, 24-hour */
  time: string;
};

export type ImportedSet = {
  weightKg: number | null;
  reps: number | null;
  /** 1–10. Only Strong and Hevy record it. */
  rpe: number | null;
  durationS: number | null;
  distanceM: number | null;
};

export type ImportedExercise = {
  /** As written in the file, first spelling seen. */
  name: string;
  /**
   * What ties this exercise to its summary, when the name alone can't: a
   * backup refers to exercises by id, and two of them can share a name.
   * Absent for the CSV formats, which go by name (see exerciseKey).
   */
  key?: string;
  sets: ImportedSet[];
};

export type ImportedWorkout = {
  start: LocalDateTime;
  /** False when the file has dates only (FitNotes) and `start.time` is our noon. */
  timeStated: boolean;
  /** From the file, when it says. Null means "not recorded", not zero. */
  durationS: number | null;
  title: string | null;
  notes: string | null;
  exercises: ImportedExercise[];
  /**
   * The real instants, when the file has them (a JLIKA backup does). Used
   * as-is rather than rebuilt from the wall-clock `start`, so a restored
   * session starts at exactly the moment the original did.
   */
  exact?: { startedAt: string; endedAt: string };
  /** How the session felt, 1–3, from a JLIKA backup. */
  rating?: number | null;
  /** The bodyweight typed at the start of the session, from a JLIKA backup. */
  bodyweightKg?: number | null;
};

/**
 * Where a backup's exercise lives. Library movements are found again by id,
 * then by slug; your own are found by name or added back to your library.
 */
export type ExerciseRef =
  | { kind: "library"; id: string; slug: string | null }
  | { kind: "own"; name: string; primaryMuscle: Muscle; equipment: Equipment; tracking: Tracking };

/** The key a summary and its workouts' exercises share. */
export function exerciseKey(exercise: { name: string; key?: string }): string {
  return exercise.key ?? exercise.name.toLowerCase();
}

/** One distinct exercise name in the file, with what the review step needs to know about it. */
export type ExerciseSummary = {
  name: string;
  /** See ImportedExercise.key. */
  key?: string;
  /** Set for a JLIKA backup: where the exercise is, so it is matched rather than guessed. */
  ref?: ExerciseRef;
  /** FitNotes' category column ("Chest", "Legs"…); null elsewhere. */
  category: string | null;
  sets: number;
  workouts: number;
  hasReps: boolean;
  hasWeight: boolean;
  hasDuration: boolean;
  hasDistance: boolean;
};

export type ImportIssue = { row: number; message: string };

export type ParsedHistory = {
  format: ImportFormat;
  workouts: ImportedWorkout[];
  exercises: ExerciseSummary[];
  setCount: number;
  /** Sets the file itself marks as warm-ups. Only those are skipped. */
  warmupsSkipped: number;
  /** Rows with nothing measured: no weight, reps, time or distance. */
  emptySkipped: number;
  /** The first few problems, in row order, worded for the lifter. */
  issues: ImportIssue[];
  issueCount: number;
  /**
   * False when the file never says whether its weights are kg or lb (Strong's
   * older export follows the app's setting without writing it down). The review
   * step then asks, and the file is read again in the unit chosen.
   */
  unitsStated: boolean;
  from: string | null;
  to: string | null;
  /** A JLIKA backup's weigh-ins, one per day. */
  bodyWeights?: BodyWeightEntry[];
  /** Sets a JLIKA backup has but never ticked off. Nothing reads those, so they stay out. */
  untickedSkipped?: number;
  /** What a JLIKA backup holds that this import leaves alone, in words for the review step. */
  ignored?: string[];
};

export type ParseResult =
  | { ok: true; history: ParsedHistory }
  | { ok: false; error: string };

/** What one workout looks like on its way to the server, exercises resolved to library ids. */
export type WorkoutPayload = {
  startedAt: string;
  endedAt: string;
  title: string | null;
  notes: string | null;
  exercises: { exerciseId: string; sets: ImportedSet[] }[];
  /** Only a JLIKA backup carries these. */
  rating?: number | null;
  bodyweightKg?: number | null;
};

export type BodyWeightEntry = {
  /** yyyy-MM-dd, the day as Health shows it. */
  date: string;
  weightKg: number;
};
