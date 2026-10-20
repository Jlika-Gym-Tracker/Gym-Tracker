import type { UnitSystem } from "@/lib/database.types";
import { displayToKg } from "@/lib/units";
import { parseCsv } from "./csv";
import { classifyRow, detectFormat, resolveColumns, type Columns } from "./formats";
import type {
  ExerciseSummary, ImportedExercise, ImportedSet, ImportedWorkout, ImportIssue,
  LocalDateTime, ParseResult,
} from "./types";
import {
  metresPer, minutesBetween, readDateTime, readDuration, readNumber, readWeightUnit,
  type WeightUnit,
} from "./values";

/**
 * Reads a Strong, Hevy or FitNotes CSV export into workouts → exercises → sets.
 *
 * Nothing in here throws on a bad row. A few thousand sets of someone's history
 * will contain oddities, and losing the whole file over one of them helps no
 * one; each bad row is skipped and described in the lifter's terms instead.
 */

export type ParseOptions = {
  /**
   * The unit to read weights (and distances) in when the file doesn't say —
   * Strong's classic export follows the app's setting silently. Defaults to the
   * profile's unit; the review step lets the lifter change it.
   */
  assumeUnits: UnitSystem;
};

/** Plausibility limits. Past these, a value is a typo or a different unit, not a set. */
const MAX_WEIGHT_KG = 1500;
const MAX_REPS = 1000;
const MAX_DURATION_S = 86_400;
const MAX_DISTANCE_M = 1_000_000;
/** Enough to show what went wrong without holding thousands of messages. */
const MAX_ISSUES = 50;

type Builder = {
  start: LocalDateTime;
  timeStated: boolean;
  durationS: number | null;
  title: string | null;
  notes: string | null;
  exercises: Map<string, ImportedExercise>;
};

const exerciseKey = (name: string) => name.toLowerCase();

export function parseHistoryCsv(text: string, options: ParseOptions): ParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { ok: false, error: "That file is empty." };

  const header = rows[0]!;
  const format = detectFormat(header);
  if (!format) {
    const sample = header.slice(0, 4).map((h) => h.trim()).filter(Boolean).join(", ");
    return {
      ok: false,
      error:
        "This doesn't look like a Strong, Hevy or FitNotes export. Their first row " +
        `names the columns (Date, Exercise…); this one starts “${sample || "blank"}”.`,
    };
  }

  const cols = resolveColumns(header);
  const dateColumn = cols.start ?? cols.date;
  if (cols.exercise === undefined || dateColumn === undefined) {
    return { ok: false, error: "This export is missing its date or exercise column, so there is nothing to place sets by." };
  }
  if (rows.length < 2) {
    return { ok: false, error: "That export names its columns but has no sets in it." };
  }

  const imperial = options.assumeUnits === "imperial";
  const fallbackWeight: WeightUnit = imperial ? "lb" : "kg";
  const fallbackMetres = imperial ? 1609.344 : 1000;
  const unitsStated =
    cols.weights.every((w) => w.unit !== "unstated") &&
    cols.distances.every((d) => d.metres !== "unstated");

  const issues: ImportIssue[] = [];
  let issueCount = 0;
  const issue = (row: number, message: string) => {
    issueCount++;
    if (issues.length < MAX_ISSUES) issues.push({ row, message: `Row ${row} ${message}` });
  };

  const workouts = new Map<string, Builder>();
  const summaries = new Map<string, ExerciseSummary & { seenIn: Set<string> }>();
  let warmupsSkipped = 0;
  let emptySkipped = 0;
  let setCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    // Spreadsheet numbering: the header is row 1.
    const row = r + 1;
    const cell = (index: number | undefined) => (index === undefined ? "" : (cells[index] ?? "").trim());
    if (cells.every((c) => c.trim() === "")) continue;

    const kind = classifyRow(cell(cols.setOrder), cell(cols.setType));
    if (kind === "not-a-set") continue;

    // Capped so a pasted paragraph in the name column can't become a library entry.
    const name = cell(cols.exercise).replace(/\s+/g, " ").slice(0, 120);
    if (!name) {
      issue(row, "has no exercise name — skipped.");
      continue;
    }

    const rawDate = cell(dateColumn);
    const when = readDateTime(rawDate);
    if (!when) {
      issue(row, rawDate ? `has a date we couldn't read (“${rawDate}”) — skipped.` : "has no date — skipped.");
      continue;
    }

    if (kind === "warmup") {
      warmupsSkipped++;
      continue;
    }

    const set = readSet(cells, cols, row, { fallbackWeight, fallbackMetres }, issue);
    if (!set) {
      emptySkipped++;
      continue;
    }

    // FitNotes has one workout per date. Strong and Hevy can have several a
    // day, told apart by their start time and name.
    const key =
      format === "hevy"
        ? `${cell(cols.start)}|${cell(cols.title)}`
        : format === "strong"
          ? `${cell(cols.workoutNumber)}|${rawDate}|${cell(cols.title)}`
          : when.at.date;

    let workout = workouts.get(key);
    if (!workout) {
      workout = {
        start: when.at,
        timeStated: when.timeStated,
        durationS: readWorkoutDuration(cells, cols, when.at),
        title: cell(cols.title) || null,
        notes: cell(cols.workoutNotes) || null,
        exercises: new Map(),
      };
      workouts.set(key, workout);
    }

    const exKey = exerciseKey(name);
    let exercise = workout.exercises.get(exKey);
    if (!exercise) {
      exercise = { name: summaries.get(exKey)?.name ?? name, sets: [] };
      workout.exercises.set(exKey, exercise);
    }
    exercise.sets.push(set);
    setCount++;

    let summary = summaries.get(exKey);
    if (!summary) {
      summary = {
        name,
        category: cell(cols.category) || null,
        sets: 0,
        workouts: 0,
        hasReps: false,
        hasWeight: false,
        hasDuration: false,
        hasDistance: false,
        seenIn: new Set(),
      };
      summaries.set(exKey, summary);
    }
    summary.sets++;
    summary.seenIn.add(key);
    summary.hasReps ||= set.reps != null;
    summary.hasWeight ||= set.weightKg != null;
    summary.hasDuration ||= set.durationS != null;
    summary.hasDistance ||= set.distanceM != null;
  }

  const ordered: ImportedWorkout[] = [...workouts.values()]
    .map((w) => ({
      start: w.start,
      timeStated: w.timeStated,
      durationS: w.durationS,
      title: w.title,
      notes: w.notes,
      exercises: [...w.exercises.values()],
    }))
    .sort((a, b) =>
      `${a.start.date}T${a.start.time}`.localeCompare(`${b.start.date}T${b.start.time}`),
    );

  const exercises: ExerciseSummary[] = [...summaries.values()]
    .map(({ seenIn, ...summary }) => ({ ...summary, workouts: seenIn.size }))
    .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));

  return {
    ok: true,
    history: {
      format,
      workouts: ordered,
      exercises,
      setCount,
      warmupsSkipped,
      emptySkipped,
      issues,
      issueCount,
      unitsStated,
      from: ordered[0]?.start.date ?? null,
      to: ordered.at(-1)?.start.date ?? null,
    },
  };
}

type Fallbacks = { fallbackWeight: WeightUnit; fallbackMetres: number };

/** One row's measurements, converted. Null when the row measured nothing at all. */
function readSet(
  cells: string[],
  cols: Columns,
  row: number,
  { fallbackWeight, fallbackMetres }: Fallbacks,
  issue: (row: number, message: string) => void,
): ImportedSet | null {
  const cell = (index: number | undefined) => (index === undefined ? "" : (cells[index] ?? "").trim());

  // Weight: the first weight column with something in it. FitNotes on iOS
  // writes both kg and lb columns; the kg one is read first so nothing is
  // converted twice.
  let weightKg: number | null = null;
  for (const column of cols.weights) {
    const raw = cell(column.index);
    const value = readNumber(raw);
    if (value === null) continue;
    if (value === undefined) {
      issue(row, `has a weight we couldn't read (“${raw}”) — imported without it.`);
      break;
    }
    const unit =
      column.unit === "column"
        ? readWeightUnit(cell(cols.weightUnit)) ?? fallbackWeight
        : column.unit === "unstated"
          ? fallbackWeight
          : column.unit;
    weightKg = round(displayToKg(value, unit === "lb" ? "imperial" : "metric"), 2);
    break;
  }
  if (weightKg !== null && (weightKg < 0 || weightKg > MAX_WEIGHT_KG)) {
    issue(row, `has a weight of ${weightKg} kg, which can't be right — imported without it.`);
    weightKg = null;
  }

  let reps: number | null = null;
  const rawReps = cell(cols.reps);
  const repsValue = readNumber(rawReps);
  if (repsValue === undefined) {
    issue(row, `has reps we couldn't read (“${rawReps}”) — imported without them.`);
  } else if (repsValue !== null) {
    if (repsValue < 0 || repsValue > MAX_REPS) {
      issue(row, `has ${repsValue} reps, which can't be right — imported without them.`);
    } else {
      reps = Math.round(repsValue);
    }
  }

  const rawRpe = cell(cols.rpe);
  const rpeValue = readNumber(rawRpe);
  // RPE runs 1–10. Strong writes 0 for "not rated", so anything outside the
  // scale is read as no rating rather than as an effort.
  const rpe = rpeValue != null && rpeValue >= 1 && rpeValue <= 10 ? round(rpeValue, 1) : null;

  let durationS: number | null = null;
  const rawSeconds = cell(cols.seconds);
  const seconds = readDuration(rawSeconds);
  if (seconds === undefined) {
    issue(row, `has a time we couldn't read (“${rawSeconds}”) — imported without it.`);
  } else if (seconds !== null) {
    if (seconds > MAX_DURATION_S) {
      issue(row, "has a set longer than a day — imported without its time.");
    } else {
      durationS = seconds;
    }
  }

  let distanceM: number | null = null;
  for (const column of cols.distances) {
    const raw = cell(column.index);
    const value = readNumber(raw);
    if (value === null) continue;
    if (value === undefined) {
      issue(row, `has a distance we couldn't read (“${raw}”) — imported without it.`);
      break;
    }
    let metres: number;
    if (column.metres === "column") {
      const rawUnit = cell(cols.distanceUnit);
      const known = metresPer(rawUnit);
      if (known === null && rawUnit) {
        issue(row, `has a distance unit we don't know (“${rawUnit}”) — read as ${fallbackMetres === 1000 ? "km" : "miles"}.`);
      }
      metres = known ?? fallbackMetres;
    } else {
      metres = column.metres === "unstated" ? fallbackMetres : column.metres;
    }
    distanceM = round(value * metres, 1);
    break;
  }
  if (distanceM !== null && (distanceM < 0 || distanceM > MAX_DISTANCE_M)) {
    issue(row, "has a distance over 1,000 km — imported without it.");
    distanceM = null;
  }

  // Zero means "not recorded" in every one of these exports: Strong writes
  // Weight 0 and Reps 0 on a treadmill row, FitNotes writes 0:00:00 for no time.
  const set: ImportedSet = {
    weightKg: weightKg || null,
    reps: reps || null,
    rpe,
    durationS: durationS || null,
    distanceM: distanceM || null,
  };
  if (set.weightKg == null && set.reps == null && set.durationS == null && set.distanceM == null) {
    return null;
  }
  return set;
}

/** Workout length in seconds from whatever the file records, or null. */
function readWorkoutDuration(cells: string[], cols: Columns, start: LocalDateTime): number | null {
  const cell = (index: number | undefined) => (index === undefined ? "" : (cells[index] ?? "").trim());

  if (cols.end !== undefined) {
    const end = readDateTime(cell(cols.end));
    if (!end) return null;
    const minutes = minutesBetween(start, end.at);
    return minutes > 0 ? minutes * 60 : null;
  }
  if (cols.duration !== undefined) {
    const seconds = readDuration(cell(cols.duration));
    return seconds ? seconds : null;
  }
  return null;
}

function round(value: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
