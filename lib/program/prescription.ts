/**
 * What to lift next time, and why.
 *
 * A pure function of the logged history. Nothing here writes back into a
 * finished session: the log is what happened, and the next target is derived
 * from it every time it is needed. Fixing a mistyped set, or switching an
 * exercise to a different rule, therefore gives the right answer at once, with
 * no stored counters to drift out of step.
 *
 * Reading a session honestly is the whole game:
 *   · a ticked set with at least the target reps (or seconds)  → hit
 *   · a ticked set with fewer                                  → miss
 *   · fewer ticked sets than the plan asked for                → miss
 * so a session that fell apart can never move the load as if it had gone well.
 *
 * Each session is judged against the plan of the day it followed, not today's
 * plan — last month's 3 × 5 is not a miss because this month says 3 × 8. A
 * session with no plan of its own (an extra added mid-workout) falls back to
 * the current one.
 */

import type {
  DayProgression, Muscle, ProgressionPolicy, Tracking, UnitSystem,
} from "@/lib/database.types";
import { effectivePolicy } from "@/lib/program/policies";
import { loadText, roundLoadKg, snapLoadKg } from "@/lib/units";

export type LoggedSet = {
  weight_kg: number | null;
  reps: number | null;
  rpe?: number | null;
  duration_s?: number | null;
  /** Cardio only; no rule reads it, but the session shows it back. */
  distance_m?: number | null;
};

export type SessionTarget = {
  sets: number | null;
  repMin: number | null;
  repMax: number | null;
  seconds: number | null;
};

/** One earlier session of this movement: its ticked sets and what it planned. */
export type PastSession = {
  date: string;
  sets: LoggedSet[];
  target: SessionTarget | null;
};

export type PrescriptionKind = "off" | "first" | "up" | "hold" | "deload";

export type Prescription = {
  policy: ProgressionPolicy;
  kind: PrescriptionKind;
  /** Load for today's working sets, or null when the rule has no opinion. */
  weightKg: number | null;
  /** Reps to aim for, when the rule sets one. */
  reps: number | null;
  /** Hold time to aim for on a timed movement. */
  seconds: number | null;
  /** One sentence answering "why this number?". */
  why: string;
  /** Sessions in a row, counting back from the latest, that missed. */
  stalls: number;
};

/** Sessions of misses before a deload. Greyskull resets on the first by design. */
export const DELOAD_AFTER: Record<ProgressionPolicy, number> = {
  off: Infinity,
  double: 3,
  linear: 3,
  greyskull: 1,
  time: 3,
};

const DELOAD_FACTOR = 0.9;
const TIME_STEP_SECONDS = 5;
/** A set rated this hard was taken to failure, whatever the rep count says. */
const FAILURE_RPE = 9.5;

/** Muscles whose lifts take the bigger jump: squats, deadlifts, hip thrusts. */
const HEAVY_MUSCLES: Muscle[] = ["quadriceps", "hamstrings", "glutes", "lower_back"];

/**
 * The load step when an exercise does not set its own: 5 kg (10 lb) for big
 * lower-body lifts on a bar or machine, 2.5 kg (5 lb) for everything else.
 * Dumbbell leg work stays on the small step — the next pair up is rarely 5 kg
 * heavier.
 */
export function defaultIncrementKg(
  primaryMuscle: string,
  equipment: string,
  system: UnitSystem,
): number {
  const heavy =
    HEAVY_MUSCLES.includes(primaryMuscle as Muscle) &&
    ["barbell", "machine", "other"].includes(equipment);
  const lb = heavy ? 10 : 5;
  const kg = heavy ? 5 : 2.5;
  return system === "imperial" ? lb / 2.2046226218 : kg;
}

type Judged = {
  ok: boolean;
  /** Heaviest ticked load, the session's working weight. */
  weight: number;
  /** Lowest rep count across the planned sets (0 for a set never done). */
  low: number;
  /** Reps on the final ticked set — Greyskull's set to failure. */
  last: number;
  goal: number | null;
  /** Hardest RPE logged, when any set was rated. */
  peakRpe: number | null;
  /** Shortest hold across the planned sets. */
  shortest: number;
};

function repGoal(policy: ProgressionPolicy, target: SessionTarget): number | null {
  // Double progression climbs to the top of the range; linear and Greyskull
  // prescribe a fixed count, so a range there is read from its bottom.
  if (policy === "double") return target.repMax ?? target.repMin;
  return target.repMin ?? target.repMax;
}

function judge(
  session: PastSession,
  fallback: SessionTarget,
  policy: ProgressionPolicy,
  tracking: Tracking,
): Judged {
  const target = session.target ?? fallback;
  const sets = session.sets;
  const planned = target.sets ?? sets.length;
  const enough = sets.length >= planned;
  const weight = Math.max(0, ...sets.map((s) => Number(s.weight_kg ?? 0)));
  const rated = sets.map((s) => s.rpe).filter((r): r is number => r != null);
  const peakRpe = rated.length ? Math.max(...rated.map(Number)) : null;

  if (tracking === "time") {
    const goal = target.seconds;
    const held = sets.map((s) => s.duration_s ?? 0);
    const shortest = enough && held.length ? Math.min(...held) : 0;
    return {
      ok: goal != null && goal > 0 && enough && held.length > 0 && held.every((h) => h >= goal),
      weight,
      low: 0,
      last: 0,
      goal,
      peakRpe,
      shortest,
    };
  }

  const goal = repGoal(policy, target);
  const reps = sets.map((s) => s.reps ?? 0);
  return {
    ok: goal != null && goal > 0 && enough && reps.length > 0 && reps.every((r) => r >= goal),
    weight,
    low: enough && reps.length ? Math.min(...reps) : 0,
    last: reps.at(-1) ?? 0,
    goal,
    peakRpe,
    shortest: 0,
  };
}

function stallCount(judged: Judged[]): number {
  let n = 0;
  for (const j of judged) {
    if (j.ok) break;
    n++;
  }
  return n;
}

/**
 * Back off by DELOAD_FACTOR onto a loadable step. On a light weight the nearest
 * step can be the weight you started from, so a deload that took nothing off
 * drops one whole step instead. Never below a single step.
 */
function deloadKg(weight: number, step: number, system: UnitSystem): number {
  let next = snapLoadKg(weight * DELOAD_FACTOR, step, system);
  if (next >= weight) next = snapLoadKg(weight - step, step, system);
  return Math.max(step, next);
}

function seconds(n: number) {
  return `${n}s`;
}

export type PrescriptionInput = {
  policy: ProgressionPolicy;
  tracking: Tracking;
  /** Today's plan. Also the yardstick for past sessions that had none. */
  plan: SessionTarget & { weightKg: number | null };
  /** Earlier sessions, newest first. Only ticked sets. */
  history: PastSession[];
  incrementKg: number;
  system: UnitSystem;
};

export function nextPrescription({
  policy,
  tracking,
  plan,
  history,
  incrementKg,
  system,
}: PrescriptionInput): Prescription {
  const base = { policy, weightKg: null, reps: null, seconds: null, stalls: 0 } as const;
  const load = (kg: number) => loadText(kg, system);
  const step = incrementKg > 0 ? incrementKg : 2.5;
  const sessions = history.filter((s) => s.sets.length > 0);
  const latest = sessions[0];

  if (policy === "off" || tracking === "cardio") {
    const last = latest ? Math.max(0, ...latest.sets.map((s) => Number(s.weight_kg ?? 0))) : 0;
    return {
      ...base,
      kind: "off",
      weightKg: plan.weightKg ?? (last > 0 ? last : null),
      seconds: plan.seconds,
      why:
        tracking === "cardio"
          ? "Cardio is logged as time and distance; nothing progresses on its own."
          : "Progression is off for this one — loads stay where you set them.",
    };
  }

  if (!latest) {
    return {
      ...base,
      kind: "first",
      weightKg: plan.weightKg,
      reps: tracking === "time" ? null : repGoal(policy, plan) ?? null,
      seconds: plan.seconds,
      why:
        tracking === "time"
          ? "Nothing logged yet — today sets the baseline. Hold each set as long as the plan says, with good form."
          : "Nothing logged yet — today sets the baseline. Pick a load you could stop two reps short of.",
    };
  }

  const judged = sessions.map((s) => judge(s, plan, policy, tracking));
  const last = judged[0]!;
  const stalls = stallCount(judged);
  const deloadAt = DELOAD_AFTER[policy];

  // ---- timed holds: the target is seconds, the load (if any) rides along.
  if (tracking === "time") {
    const goal = last.goal ?? plan.seconds ?? 0;
    const weightKg = last.weight > 0 ? last.weight : plan.weightKg;
    if (goal <= 0) {
      return {
        ...base, kind: "hold", weightKg, stalls,
        why: "No hold time in the plan to judge against — set one and the rule takes over.",
      };
    }
    if (last.ok) {
      const next = goal + TIME_STEP_SECONDS;
      return {
        ...base, kind: "up", weightKg, seconds: next, stalls,
        why: `Held every set for ${seconds(goal)} — the target goes up to ${seconds(next)}.`,
      };
    }
    if (stalls >= deloadAt) {
      const next = Math.max(
        TIME_STEP_SECONDS,
        Math.round((goal * DELOAD_FACTOR) / TIME_STEP_SECONDS) * TIME_STEP_SECONDS,
      );
      const backed = next >= goal ? Math.max(TIME_STEP_SECONDS, goal - TIME_STEP_SECONDS) : next;
      return {
        ...base, kind: "deload", weightKg, seconds: backed, stalls,
        why: `Short of ${seconds(goal)} ${stalls} sessions running — back off to ${seconds(backed)} and build up again.`,
      };
    }
    return {
      ...base, kind: "hold", weightKg, seconds: goal, stalls,
      why: `Came up short of ${seconds(goal)} last time — same target again.`,
    };
  }

  const goal = last.goal;
  const bottom = plan.repMin ?? goal;
  const top = plan.repMax ?? goal;

  if (goal == null || goal <= 0) {
    return {
      ...base,
      kind: "hold",
      weightKg: last.weight > 0 ? last.weight : plan.weightKg,
      stalls: 0,
      why: "No rep target in the plan, so there is nothing to judge — add a rep range and the rule takes over.",
    };
  }

  // ---- bodyweight: nothing to add or take off, so progress in reps. This runs
  // ahead of every rule because it is true for all of them; "deload your
  // push-ups to 2.5 kg" is not advice.
  if (last.weight <= 0) {
    if (last.ok) {
      return {
        ...base, kind: "up", reps: goal + 1, stalls,
        why: `Bodyweight — every rep last time, so go for ${goal + 1} on each set.`,
      };
    }
    return {
      ...base, kind: "hold", reps: goal, stalls,
      why: `Bodyweight — stay at ${goal} until every set is clean.`,
    };
  }

  const w = last.weight;

  if (policy === "double") {
    const floor = Math.min(bottom ?? goal, goal);
    if (last.ok && last.peakRpe != null && last.peakRpe >= FAILURE_RPE) {
      return {
        ...base, kind: "hold", weightKg: w, reps: goal, stalls,
        why: `You cleared the range at ${load(w)}, but at RPE ${last.peakRpe} — repeat it and own it before adding weight.`,
      };
    }
    if (last.ok) {
      const next = roundLoadKg(w + step, system);
      return {
        ...base, kind: "up", weightKg: next, reps: floor, stalls,
        why: `Top of the range (${goal}) on every set at ${load(w)} — add ${load(step)} and start back at ${floor} reps.`,
      };
    }
    if (stalls >= deloadAt) {
      const next = deloadKg(w, step, system);
      return {
        ...base, kind: "deload", weightKg: next, reps: floor, stalls,
        why: `No progress ${stalls} sessions running — deload to ${load(next)} and climb the range again.`,
      };
    }
    const aim = Math.min(top ?? goal, Math.max(floor, last.low + 1));
    return {
      ...base, kind: "hold", weightKg: w, reps: aim, stalls,
      why: `Same ${load(w)} — aim for ${aim} reps on every set, working up to ${goal}.`,
    };
  }

  // ---- linear and Greyskull
  if (last.ok) {
    // Greyskull's last set goes to failure: double the target there and you
    // have earned twice the jump.
    const doubled = policy === "greyskull" && last.last >= goal * 2;
    const jump = doubled ? step * 2 : step;
    const next = roundLoadKg(w + jump, system);
    return {
      ...base, kind: "up", weightKg: next, reps: goal, stalls,
      why: doubled
        ? `Your last set hit ${last.last} — twice the target — so take a double jump to ${load(next)}.`
        : `Every rep of every set at ${load(w)} — ${load(step)} more.`,
    };
  }
  if (stalls >= deloadAt) {
    const next = deloadKg(w, step, system);
    return {
      ...base, kind: "deload", weightKg: next, reps: goal, stalls,
      why:
        policy === "greyskull"
          ? `Missed reps at ${load(w)} — Greyskull resets 10 %, to ${load(next)}, and you work back up.`
          : `Missed reps ${stalls} sessions running — reset to ${load(next)} and work back up.`,
    };
  }
  const left = deloadAt - stalls;
  return {
    ...base, kind: "hold", weightKg: w, reps: goal, stalls,
    why: `Missed reps at ${load(w)} last time — same weight again (${left} more ${left === 1 ? "miss" : "misses"} before a deload).`,
  };
}

/** A program row as the rest of the app holds it, ready to be prescribed. */
export type PlanItem = {
  tracking: Tracking;
  primaryMuscle: string;
  equipment: string;
  /** The rule on the program day this row belongs to (null for extras). */
  dayPolicy: DayProgression | null;
  plan: {
    target_sets: number;
    rep_min: number | null;
    rep_max: number | null;
    target_seconds: number | null;
    target_weight_kg: number | null;
    progression: ProgressionPolicy | null;
    increment_kg: number | null;
  } | null;
};

/**
 * Resolves the rule and the load step for one program row, then prescribes.
 * The one place that decides "which rule, which step" — the session screen,
 * the session's pre-filled loads and "copy last week" all come through here, so
 * the number you read on Monday is the number you get.
 */
export function prescribe(item: PlanItem, history: PastSession[], system: UnitSystem): Prescription {
  const { plan } = item;
  const policy = effectivePolicy(plan?.progression, item.dayPolicy, item.tracking);
  const incrementKg =
    plan?.increment_kg != null && Number(plan.increment_kg) > 0
      ? Number(plan.increment_kg)
      : defaultIncrementKg(item.primaryMuscle, item.equipment, system);
  return nextPrescription({
    policy,
    tracking: item.tracking,
    plan: {
      sets: plan?.target_sets ?? null,
      repMin: plan?.rep_min ?? null,
      repMax: plan?.rep_max ?? null,
      seconds: plan?.target_seconds ?? null,
      weightKg: plan?.target_weight_kg == null ? null : Number(plan.target_weight_kg),
    },
    history,
    incrementKg,
    system,
  });
}
