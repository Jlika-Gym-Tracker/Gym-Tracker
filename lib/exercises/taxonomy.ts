import type { Equipment, Muscle, Tracking } from "@/lib/database.types";

/**
 * How the library is sorted and named on screen, shared by the builder's
 * library panel and the Exercises page so the two filter the same way.
 */

export { MUSCLE_LABEL } from "@/lib/training/muscle-load";

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barbell", dumbbell: "Dumbbell", machine: "Machine", cable: "Cable",
  body_only: "Bodyweight", bands: "Bands", kettlebells: "Kettlebell",
  ez_curl_bar: "EZ bar", exercise_ball: "Ball", medicine_ball: "Med ball",
  foam_roll: "Foam roll", other: "Other",
};

export const TRACKING_LABEL: Record<Tracking, string> = {
  reps: "Weight × reps",
  time: "Time held",
  cardio: "Cardio",
};

/** The chips: each group is the primary muscles that count as it. */
export const MUSCLE_GROUPS: readonly { key: string; label: string; muscles: readonly Muscle[] }[] = [
  { key: "chest", label: "CHEST", muscles: ["chest"] },
  { key: "back", label: "BACK", muscles: ["lats", "middle_back", "lower_back", "traps", "neck"] },
  { key: "shoulders", label: "DELTS", muscles: ["shoulders"] },
  { key: "arms", label: "ARMS", muscles: ["biceps", "triceps", "forearms"] },
  {
    key: "legs",
    label: "LEGS",
    muscles: ["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"],
  },
  { key: "core", label: "CORE", muscles: ["abdominals"] },
];

export function equipmentLabel(key: string): string {
  return EQUIPMENT_LABEL[key as Equipment] ?? key;
}

/** Equipment keys in the order their labels read. */
export function sortEquipment(keys: Iterable<string>): string[] {
  return [...new Set(keys)].sort((a, b) => equipmentLabel(a).localeCompare(equipmentLabel(b)));
}
