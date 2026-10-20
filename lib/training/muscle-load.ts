/**
 * How much work each muscle got: the numbers behind the muscle map. Pure
 * functions, unit-tested.
 *
 * A set counts once for the exercise's primary muscle and half for each
 * secondary one. A bench press does train the triceps, but crediting it as a
 * full triceps set would make every push day look like an arm day.
 */

import type { Muscle } from "@/lib/database.types";
import { isHardSet } from "./effort";

/** Sets per muscle. Muscles with no work are left out rather than set to 0. */
export type MuscleLoad = Partial<Record<Muscle, number>>;

/** Head to toe, so any list built from it reads down the body. */
export const MUSCLES: readonly Muscle[] = [
  "neck", "traps", "shoulders", "chest", "biceps", "triceps", "forearms",
  "lats", "middle_back", "lower_back", "abdominals", "glutes", "abductors",
  "adductors", "quadriceps", "hamstrings", "calves",
];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  neck: "Neck", traps: "Traps", shoulders: "Shoulders", chest: "Chest",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms", lats: "Lats",
  middle_back: "Mid back", lower_back: "Lower back", abdominals: "Core",
  glutes: "Glutes", abductors: "Abductors", adductors: "Adductors",
  quadriceps: "Quads", hamstrings: "Hamstrings", calves: "Calves",
};

/** The spans the muscle map can be read over. */
export type LoadWindow = "week" | "30d" | "all";

export const LOAD_WINDOWS: readonly { key: LoadWindow; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

export const PRIMARY_SHARE = 1;
export const SECONDARY_SHARE = 0.5;

const KNOWN = new Set<string>(MUSCLES);

/**
 * A muscle name as the exercise library spells it, or null.
 *
 * secondary_muscles is free text[], and at least one older row writes
 * "lower back" with a space, so spaces and hyphens fold to underscores.
 */
export function normaliseMuscle(name: string | null | undefined): Muscle | null {
  if (!name) return null;
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return KNOWN.has(key) ? (key as Muscle) : null;
}

export type LoadSet = {
  primaryMuscle: string;
  secondaryMuscles?: readonly string[] | null;
  /** Stored RPE, only read when counting hard sets. */
  rpe?: number | null;
};

/**
 * Sets per muscle across completed sets.
 *
 * `hardOnly` keeps only sets rated hard (RIR ≤ 3) — the ones that count as
 * real stimulus. Unrated sets drop out of that view, since there is no way to
 * know how hard they were.
 */
export function muscleLoad(
  sets: Iterable<LoadSet>,
  { hardOnly = false }: { hardOnly?: boolean } = {},
): MuscleLoad {
  const load: MuscleLoad = {};
  const add = (muscle: Muscle, amount: number) => {
    load[muscle] = (load[muscle] ?? 0) + amount;
  };

  for (const set of sets) {
    if (hardOnly && !isHardSet(set.rpe)) continue;
    const primary = normaliseMuscle(set.primaryMuscle);
    if (primary) add(primary, PRIMARY_SHARE);

    // A muscle listed twice, or listed as both primary and secondary, is
    // still one muscle doing the work.
    const secondary = new Set(
      (set.secondaryMuscles ?? []).map(normaliseMuscle).filter((m): m is Muscle => m != null),
    );
    if (primary) secondary.delete(primary);
    for (const muscle of secondary) add(muscle, SECONDARY_SHARE);
  }

  return load;
}

/** Muscles that got no work at all, head to toe. */
export function untrainedMuscles(load: MuscleLoad): Muscle[] {
  return MUSCLES.filter((muscle) => !(load[muscle] && load[muscle]! > 0));
}

/** The busiest muscle's load — what the map's shading is relative to. */
export function peakLoad(load: MuscleLoad): number {
  return Math.max(0, ...Object.values(load).map((v) => v ?? 0));
}
