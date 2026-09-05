import type { Goal, Profile } from "@/lib/database.types";

export const GOAL_LABELS: Record<Goal, string> = {
  cut: "Fat loss",
  bulk: "Muscle gain",
  recomp: "Recomp",
  strength: "Strength",
  health: "Health",
};

export function goalLabel(goal: Goal) {
  return GOAL_LABELS[goal] ?? "Fat loss";
}

/** "FAT LOSS · 4 D/WK" — the line under the name in the sidebar. */
export function goalLine(profile: Pick<Profile, "goal">, trainingDays?: number) {
  const goal = goalLabel(profile.goal);
  return trainingDays ? `${goal} · ${trainingDays} d/wk` : goal;
}
