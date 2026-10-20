/**
 * The named rules that decide next session's load. The engine lives in
 * lib/program/prescription.ts; this file is only what they are called and
 * which movements each can drive, so the builder and anything proposing plan
 * changes share one vocabulary.
 */

import type { DayProgression, ProgressionPolicy, Tracking } from "@/lib/database.types";

export type { DayProgression, ProgressionPolicy };

export const DAY_POLICIES: DayProgression[] = ["double", "linear", "greyskull", "off"];

export const POLICY_NAME: Record<ProgressionPolicy, string> = {
  off: "No automatic progression",
  double: "Double progression",
  linear: "Linear progression",
  greyskull: "Greyskull LP",
  time: "Add time",
};

export const POLICY_SHORT: Record<ProgressionPolicy, string> = {
  off: "Off",
  double: "Double",
  linear: "Linear",
  greyskull: "Greyskull",
  time: "Add time",
};

export const POLICY_DESCRIPTION: Record<ProgressionPolicy, string> = {
  off: "Loads stay where you set them.",
  double:
    "Work up through the rep range at one weight. Reach the top in every set and the weight goes up, reps back to the bottom.",
  linear:
    "Hit every rep of every set and the weight goes up next time. Three sessions of misses in a row trigger a 10 % deload.",
  greyskull:
    "Straight sets with the last one taken to failure. Beat the target there and the weight goes up — twice the target earns a double jump. One miss resets 10 %.",
  time: "Hold every set for the full time and the target goes up 5 seconds.",
};

/** Which rules make sense for how a movement is logged. */
export const POLICIES_FOR: Record<Tracking, ProgressionPolicy[]> = {
  reps: ["double", "linear", "greyskull", "off"],
  time: ["time", "off"],
  cardio: ["off"],
};

/**
 * The rule in force for one exercise: its own override if it has one and that
 * override fits how it is logged, else the day's rule mapped onto the
 * movement's mode. A timed hold under a "linear" day progresses in time; cardio
 * never progresses on its own.
 */
export function effectivePolicy(
  override: ProgressionPolicy | null | undefined,
  dayPolicy: DayProgression | null | undefined,
  tracking: Tracking,
): ProgressionPolicy {
  const allowed = POLICIES_FOR[tracking];
  if (override && allowed.includes(override)) return override;
  const day = dayPolicy ?? "double";
  if (tracking === "time") return day === "off" ? "off" : "time";
  if (tracking === "cardio") return "off";
  return allowed.includes(day) ? day : "double";
}
