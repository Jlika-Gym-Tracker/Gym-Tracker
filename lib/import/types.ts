/**
 * The one shape every training-history export is read into, whichever app it
 * came from: workouts → exercises → sets.
 *
 * Weights are already kg and distances metres by the time anything lands here,
 * so nothing downstream has to know that Hevy wrote miles or FitNotes wrote lbs
 * on every other row.
 */

export type ImportFormat = "strong" | "hevy" | "fitnotes-android" | "fitnotes-ios";

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  strong: "Strong",
  hevy: "Hevy",
  "fitnotes-android": "FitNotes (Android)",
  "fitnotes-ios": "FitNotes (iOS)",
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
};

/** One distinct exercise name in the file, with what the review step needs to know about it. */
export type ExerciseSummary = {
  name: string;
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
};

export type BodyWeightEntry = {
  /** yyyy-MM-dd, the day as Health shows it. */
  date: string;
  weightKg: number;
};
