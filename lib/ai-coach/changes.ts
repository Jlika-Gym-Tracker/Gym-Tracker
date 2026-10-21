/**
 * A review's changes: checked against the plan they were written for, shown
 * as before → after, and applied as a pure transform of a week.
 *
 * Changes must be independent of each other — no two may touch the same
 * exercise, the same day name, or the same day rule. That is what lets the
 * person tick any subset and get exactly what each ticked line says, and it
 * is checked here rather than trusted to the prompt.
 *
 * The before → after text is rendered from the plan, not taken from the
 * model, so what the person approves is what gets written.
 */

import { POLICIES_FOR, POLICY_NAME, effectivePolicy } from "@/lib/program/policies";
import { formatWeight, trimNumber, weightUnit } from "@/lib/units";
import type { DayProgression, UnitSystem } from "@/lib/database.types";
import { checkPrescription, clip, LIMITS, tidySupersets, type Checked } from "./plan";
import type { CatalogEntry, Change, SnapshotDay, SnapshotExercise, WeekSnapshot } from "./schemas";
import { fillWeek } from "./week";

export type ResolvedChange = {
  change: Change;
  target: string;
  before: string;
  after: string;
};

type Context = {
  catalog: CatalogEntry[];
  /** Weekday label per day_index, e.g. ["Mon", …]. */
  dayLabels: string[];
  units: UnitSystem;
};

const DAY_RULES: DayProgression[] = ["double", "linear", "greyskull", "off"];
const MAX_EXERCISES_PER_DAY = 14;

// ------------------------------------------------------------- formatting

function prescription(e: Pick<SnapshotExercise, "target_sets" | "rep_min" | "rep_max" | "target_seconds">) {
  if (e.target_seconds != null) return `${e.target_sets} × ${formatSeconds(e.target_seconds)}`;
  if (e.rep_min == null) return `${e.target_sets} sets`;
  return `${e.target_sets} × ${repRange(e.rep_min, e.rep_max)}`;
}

function repRange(min: number | null, max: number | null) {
  if (min == null) return "—";
  return max != null && max !== min ? `${min}–${max}` : String(min);
}

export function formatSeconds(seconds: number) {
  if (seconds < 120) return `${seconds} s`;
  const minutes = seconds / 60;
  return `${trimNumber(minutes, 1)} min`;
}

function load(kg: number | null, units: UnitSystem) {
  return kg == null ? "No planned load" : `${formatWeight(kg, units, 2)} ${weightUnit(units)}`;
}

// ------------------------------------------------------------ resolution

type Found = { day: SnapshotDay; exercise: SnapshotExercise; entry: CatalogEntry };

function finder(week: WeekSnapshot, catalog: CatalogEntry[]) {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const bySlug = new Map(catalog.map((e) => [e.slug, e]));
  const days = fillWeek(week.days);

  return {
    bySlug,
    byId,
    day: (index: number) => days[index]!,
    /** The exercise with this slug on that day, or a sentence saying why not. */
    exercise(index: number, slug: string): Found | string {
      const day = days[index];
      if (!day) return `There is no day ${index}.`;
      const entry = bySlug.get(slug);
      if (!entry) return `"${slug}" is not in the catalog.`;
      const matches = day.exercises.filter((e) => e.exercise_id === entry.id);
      if (matches.length === 0) return `${slug} is not on day ${index} (${day.name}).`;
      if (matches.length > 1) return `${slug} appears twice on day ${index}; it cannot be changed by name.`;
      return { day, exercise: matches[0]!, entry };
    },
  };
}

function nameOf(exercise: SnapshotExercise, byId: Map<string, CatalogEntry>) {
  return byId.get(exercise.exercise_id)?.name ?? "an exercise";
}

/** Which plan element a change claims; two changes may not claim the same one. */
function claims(change: Change): string[] {
  const day = change.day_index;
  switch (change.type) {
    case "swap_exercise":
      return [`${day}:${change.exercise}`, `${day}:${change.to_exercise}`];
    case "add_exercise":
      return [`${day}:${change.exercise}`];
    case "set_progression":
      return [change.exercise ? `${day}:${change.exercise}` : `${day}:#rule`];
    case "rename_day":
      return [`${day}:#name`];
    default:
      return [`${day}:${change.exercise}`];
  }
}

/**
 * Checks each change against the base week and the catalog. Changes that
 * would do nothing are dropped quietly; anything else wrong is an error.
 */
export function validateChanges(
  changes: Change[],
  base: WeekSnapshot,
  context: Context,
): Checked<ResolvedChange[]> {
  const errors: string[] = [];
  const resolved: ResolvedChange[] = [];
  const find = finder(base, context.catalog);
  const claimed = new Map<string, number>();
  const removed = new Set<string>();

  for (const change of changes) {
    if (change.type === "remove_exercise" || change.type === "swap_exercise") {
      removed.add(`${change.day_index}:${change.exercise}`);
    }
  }

  changes.forEach((change, index) => {
    const label = `Change ${index + 1} (${change.type})`;
    const result = resolve(change, find, context);
    if (typeof result === "string") {
      errors.push(`${label}: ${result}`);
      return;
    }
    if (result === null) return; // a no-op

    for (const key of claims(change)) {
      const other = claimed.get(key);
      if (other != null) {
        errors.push(
          `${label} and change ${other + 1} both touch ${key.replace(/^\d+:/, `day ${change.day_index} `)}. Combine them into one change or drop one.`,
        );
        return;
      }
    }
    if (change.type === "add_exercise" && change.after_exercise && removed.has(`${change.day_index}:${change.after_exercise}`)) {
      errors.push(`${label} places ${change.exercise} after ${change.after_exercise}, which another change removes. Anchor it to an exercise that stays.`);
      return;
    }
    for (const key of claims(change)) claimed.set(key, index);
    resolved.push(result);
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: resolved };
}

function resolve(
  change: Change,
  find: ReturnType<typeof finder>,
  { units, dayLabels }: Context,
): ResolvedChange | string | null {
  const day = find.day(change.day_index);
  if (!day) return `There is no day ${change.day_index}.`;
  const dayTarget = `${dayLabels[change.day_index] ?? `Day ${change.day_index + 1}`} · ${day.name}`;
  const at = (name: string) => `${dayTarget} — ${name}`;

  switch (change.type) {
    case "swap_exercise": {
      const found = find.exercise(change.day_index, change.exercise);
      if (typeof found === "string") return found;
      const to = find.bySlug.get(change.to_exercise);
      if (!to) return `"${change.to_exercise}" is not in the catalog.`;
      if (to.id === found.entry.id) return null;
      if (day.exercises.some((e) => e.exercise_id === to.id)) {
        return `${change.to_exercise} is already on day ${change.day_index}.`;
      }
      if (to.tracking !== found.entry.tracking) {
        return `${change.exercise} is logged by ${found.entry.tracking} and ${change.to_exercise} by ${to.tracking}; swap only like for like, or remove one and add the other.`;
      }
      return {
        change,
        target: at(found.entry.name),
        before: `${found.entry.name} · ${prescription(found.exercise)}`,
        after: `${to.name} · ${prescription(found.exercise)}`,
      };
    }

    case "add_exercise": {
      const entry = find.bySlug.get(change.exercise);
      if (!entry) return `"${change.exercise}" is not in the catalog.`;
      if (day.exercises.some((e) => e.exercise_id === entry.id)) {
        return `${change.exercise} is already on day ${change.day_index}.`;
      }
      if (day.exercises.length >= MAX_EXERCISES_PER_DAY) return `Day ${change.day_index} is already full.`;
      if (change.after_exercise) {
        const anchor = find.exercise(change.day_index, change.after_exercise);
        if (typeof anchor === "string") return `after_exercise: ${anchor}`;
      }
      const errors: string[] = [];
      const shape = checkPrescription(
        { slug: change.exercise, rep_min: change.rep_min, rep_max: change.rep_max, target_seconds: change.target_seconds },
        entry,
        `day ${change.day_index}`,
        errors,
      );
      if (!shape) return errors.join(" ");
      return {
        change,
        target: at(entry.name),
        before: "Not in the plan",
        after: `${entry.name} · ${prescription({ target_sets: change.sets, ...shape })}`,
      };
    }

    case "remove_exercise": {
      const found = find.exercise(change.day_index, change.exercise);
      if (typeof found === "string") return found;
      return {
        change,
        target: at(found.entry.name),
        before: `${found.entry.name} · ${prescription(found.exercise)}`,
        after: "Removed",
      };
    }

    case "set_sets": {
      const found = find.exercise(change.day_index, change.exercise);
      if (typeof found === "string") return found;
      if (found.exercise.target_sets === change.sets) return null;
      return {
        change,
        target: at(found.entry.name),
        before: `${found.exercise.target_sets} sets`,
        after: `${change.sets} sets`,
      };
    }

    case "set_rep_range": {
      const found = find.exercise(change.day_index, change.exercise);
      if (typeof found === "string") return found;
      if (found.entry.tracking !== "reps") return `${change.exercise} is logged by ${found.entry.tracking}, not reps.`;
      if (change.rep_max < change.rep_min) return `rep_max ${change.rep_max} is below rep_min ${change.rep_min}.`;
      if (found.exercise.rep_min === change.rep_min && found.exercise.rep_max === change.rep_max) return null;
      return {
        change,
        target: at(found.entry.name),
        before: `${repRange(found.exercise.rep_min, found.exercise.rep_max)} reps`,
        after: `${repRange(change.rep_min, change.rep_max)} reps`,
      };
    }

    case "set_target_seconds": {
      const found = find.exercise(change.day_index, change.exercise);
      if (typeof found === "string") return found;
      if (found.entry.tracking === "reps") return `${change.exercise} is logged in reps, not time.`;
      if (found.exercise.target_seconds === change.target_seconds) return null;
      return {
        change,
        target: at(found.entry.name),
        before: found.exercise.target_seconds == null ? "No target time" : formatSeconds(found.exercise.target_seconds),
        after: formatSeconds(change.target_seconds),
      };
    }

    case "set_load": {
      const found = find.exercise(change.day_index, change.exercise);
      if (typeof found === "string") return found;
      if (found.entry.tracking === "cardio") return `${change.exercise} is cardio and carries no load.`;
      const next = change.load_kg == null ? null : roundLoad(change.load_kg);
      if (found.exercise.target_weight_kg === next) return null;
      return {
        change,
        target: at(found.entry.name),
        before: load(found.exercise.target_weight_kg, units),
        after: load(next, units),
      };
    }

    case "set_progression": {
      if (change.exercise == null) {
        const rule = change.progression;
        if (rule == null || !DAY_RULES.includes(rule as DayProgression)) {
          return `A day's rule must be one of ${DAY_RULES.join(", ")}.`;
        }
        if (rule === day.progression) return null;
        return {
          change,
          target: `${dayTarget} — day rule`,
          before: POLICY_NAME[day.progression],
          after: POLICY_NAME[rule],
        };
      }
      const found = find.exercise(change.day_index, change.exercise);
      if (typeof found === "string") return found;
      const allowed = POLICIES_FOR[found.entry.tracking];
      if (change.progression != null && !allowed.includes(change.progression)) {
        return `${change.exercise} is logged by ${found.entry.tracking}; its rule must be one of ${allowed.join(", ")} or null.`;
      }
      const now = effectivePolicy(found.exercise.progression, day.progression, found.entry.tracking);
      const next = effectivePolicy(change.progression, day.progression, found.entry.tracking);
      // Judged by the rule that would actually run, not by how it is spelled.
      if (now === next) return null;
      return {
        change,
        target: at(found.entry.name),
        before: found.exercise.progression ? POLICY_NAME[now] : `${POLICY_NAME[now]} (day rule)`,
        after: change.progression ? POLICY_NAME[next] : `${POLICY_NAME[next]} (day rule)`,
      };
    }

    case "set_superset": {
      const found = find.exercise(change.day_index, change.exercise);
      if (typeof found === "string") return found;
      if ((found.exercise.superset_group ?? null) === change.superset) return null;
      const partners = (group: number | null) =>
        group == null
          ? []
          : day.exercises
              .filter((e) => e !== found.exercise && e.superset_group === group)
              .map((e) => nameOf(e, find.byId));
      const nextPartners = partners(change.superset);
      if (change.superset != null && nextPartners.length === 0) {
        return `Superset ${change.superset} has no other exercise on day ${change.day_index}; a superset needs a partner already in it.`;
      }
      const describe = (group: number | null, names: string[]) =>
        group == null ? "Not in a superset" : names.length ? `Superset ${group} with ${names.join(", ")}` : `Superset ${group}`;
      return {
        change,
        target: at(found.entry.name),
        before: describe(found.exercise.superset_group, partners(found.exercise.superset_group)),
        after: describe(change.superset, nextPartners),
      };
    }

    case "rename_day": {
      const name = clip(change.name, LIMITS.dayName);
      const focus = change.focus_note ? clip(change.focus_note, LIMITS.focusNote) : null;
      if (name === day.name && focus === day.focus_note) return null;
      const show = (n: string, f: string | null) => (f ? `${n} — ${f}` : n);
      return {
        change,
        target: dayTarget,
        before: show(day.name, day.focus_note),
        after: show(name, focus),
      };
    }
  }
}

function roundLoad(kg: number) {
  // Plates come in 1.25 kg at best; anything finer is fiction.
  return Math.round(kg * 4) / 4;
}

// ---------------------------------------------------------------- applying

/**
 * The week with the given changes applied, as a new week. Assumes they passed
 * validateChanges against this same base; anything that no longer resolves is
 * skipped rather than half-applied. The result is a draft.
 */
export function applyChanges(base: WeekSnapshot, changes: Change[], catalog: CatalogEntry[]): WeekSnapshot {
  const bySlug = new Map(catalog.map((e) => [e.slug, e]));
  const days = fillWeek(base.days).map((day) => ({ ...day, exercises: day.exercises.map((e) => ({ ...e })) }));

  const locate = (dayIndex: number, slug: string) => {
    const entry = bySlug.get(slug);
    const day = days[dayIndex];
    if (!entry || !day) return null;
    const exercise = day.exercises.find((e) => e.exercise_id === entry.id);
    return exercise ? { day, exercise, entry } : null;
  };

  // Additions go in last, so an anchor a removal leaves behind is still found.
  const ordered = [
    ...changes.filter((c) => c.type !== "add_exercise"),
    ...changes.filter((c) => c.type === "add_exercise"),
  ];

  for (const change of ordered) {
    const day = days[change.day_index];
    if (!day) continue;

    switch (change.type) {
      case "swap_exercise": {
        const found = locate(change.day_index, change.exercise);
        const to = bySlug.get(change.to_exercise);
        if (!found || !to) break;
        found.exercise.exercise_id = to.id;
        found.exercise.note = clip(change.why, LIMITS.note);
        // A planned load belongs to the movement it was planned for.
        found.exercise.target_weight_kg = null;
        if (found.exercise.progression && !POLICIES_FOR[to.tracking].includes(found.exercise.progression)) {
          found.exercise.progression = null;
        }
        break;
      }
      case "add_exercise": {
        const entry = bySlug.get(change.exercise);
        if (!entry) break;
        const row: SnapshotExercise = {
          id: null,
          exercise_id: entry.id,
          position: 0,
          target_sets: change.sets,
          rep_min: entry.tracking === "reps" ? change.rep_min : null,
          rep_max: entry.tracking === "reps" ? change.rep_max : null,
          per_side: change.per_side,
          note: clip(change.why, LIMITS.note),
          target_weight_kg: null,
          superset_group: change.superset,
          target_seconds: entry.tracking === "reps" ? null : change.target_seconds,
          progression: null,
          increment_kg: null,
        };
        const anchor = change.after_exercise ? locate(change.day_index, change.after_exercise) : null;
        const at = anchor ? day.exercises.indexOf(anchor.exercise) + 1 : day.exercises.length;
        day.exercises.splice(at, 0, row);
        // Adding to a rest day makes it a training day, as in the builder.
        day.is_rest = false;
        break;
      }
      case "remove_exercise": {
        const found = locate(change.day_index, change.exercise);
        if (!found) break;
        day.exercises = day.exercises.filter((e) => e !== found.exercise);
        break;
      }
      case "set_sets": {
        const found = locate(change.day_index, change.exercise);
        if (found) found.exercise.target_sets = change.sets;
        break;
      }
      case "set_rep_range": {
        const found = locate(change.day_index, change.exercise);
        if (found) {
          found.exercise.rep_min = change.rep_min;
          found.exercise.rep_max = change.rep_max;
        }
        break;
      }
      case "set_target_seconds": {
        const found = locate(change.day_index, change.exercise);
        if (found) found.exercise.target_seconds = change.target_seconds;
        break;
      }
      case "set_load": {
        const found = locate(change.day_index, change.exercise);
        if (found) found.exercise.target_weight_kg = change.load_kg == null ? null : roundLoad(change.load_kg);
        break;
      }
      case "set_progression": {
        if (change.exercise == null) {
          if (change.progression && DAY_RULES.includes(change.progression as DayProgression)) {
            day.progression = change.progression as DayProgression;
          }
          break;
        }
        const found = locate(change.day_index, change.exercise);
        if (found) found.exercise.progression = change.progression;
        break;
      }
      case "set_superset": {
        const found = locate(change.day_index, change.exercise);
        if (found) found.exercise.superset_group = change.superset;
        break;
      }
      case "rename_day": {
        day.name = clip(change.name, LIMITS.dayName) || day.name;
        day.focus_note = change.focus_note ? clip(change.focus_note, LIMITS.focusNote) : null;
        break;
      }
    }
  }

  return {
    week: base.week ? { ...base.week, status: "draft" } : null,
    days: days.map((day) => {
      const exercises = tidySupersets(day.exercises).map((e, position) => ({ ...e, position }));
      // A day whose last exercise went is a rest day, as the week strip shows it.
      return { ...day, is_rest: exercises.length === 0 ? true : day.is_rest, exercises };
    }),
  };
}
