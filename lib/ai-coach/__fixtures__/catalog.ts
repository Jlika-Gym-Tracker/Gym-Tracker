/**
 * The seeded library as the AI Coach holds it, for tests. Tracking follows
 * 20261020000028 (planks and carries are timed); a treadmill is added for
 * cardio, and a few movements get the secondary muscles the seed carries.
 */

import { SEEDED_LIBRARY } from "@/lib/program/__fixtures__/library";
import type { Equipment, Muscle } from "@/lib/database.types";
import type { CatalogEntry } from "../schemas";

const TIMED = new Set(["plank", "farmers-walk"]);
const SECONDARY: Record<string, string[]> = {
  "barbell-squat": ["glutes", "hamstrings"],
  "romanian-deadlift": ["glutes", "lower_back"],
  "barbell-bench-press-medium-grip": ["shoulders", "triceps"],
};

export const CATALOG: CatalogEntry[] = [
  ...SEEDED_LIBRARY.map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    primary_muscle: e.primary_muscle as Muscle,
    secondary_muscles: SECONDARY[e.slug] ?? [],
    equipment: e.equipment as Equipment,
    tracking: TIMED.has(e.slug) ? ("time" as const) : ("reps" as const),
  })),
  {
    id: "00000000-0000-4000-8000-000000000100",
    slug: "running-treadmill",
    name: "Running, Treadmill",
    primary_muscle: "quadriceps",
    secondary_muscles: ["calves", "glutes", "hamstrings"],
    equipment: "machine",
    tracking: "cardio",
  },
];

export const bySlug = (slug: string) => {
  const entry = CATALOG.find((e) => e.slug === slug);
  if (!entry) throw new Error(`No ${slug} in the test catalog`);
  return entry;
};

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
