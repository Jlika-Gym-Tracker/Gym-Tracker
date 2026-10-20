/**
 * Canned answers for AI_COACH_FIXTURE=1, so the whole loop — intake, preview,
 * refine, accept, review, apply, revert — can be clicked through locally with
 * no key and no requests. Built from the person's own catalog and plan so the
 * answers pass the same checks a real one must. Never used in production
 * (lib/ai-coach/env.ts).
 */

import type { Muscle } from "@/lib/database.types";
import type { Transport } from "./generate";
import type { PlanForModel } from "./payload";
import type { ValidPlan } from "./plan";
import type { CatalogEntry, Intake, PlanOutput, ReviewOutput } from "./schemas";

/** Training-day positions for n days a week, rest days between where possible. */
export function spreadDays(n: number): number[] {
  const layouts: Record<number, number[]> = {
    1: [0],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return layouts[Math.min(7, Math.max(1, n))]!;
}

const DAY_SHAPES: { name: string; focus: string; muscles: Muscle[] }[] = [
  { name: "Full body A", focus: "Squat, push and pull, then core.", muscles: ["quadriceps", "chest", "middle_back", "shoulders", "abdominals"] },
  { name: "Full body B", focus: "Hinge, pull and press, then calves.", muscles: ["hamstrings", "lats", "chest", "triceps", "calves"] },
  { name: "Full body C", focus: "Legs and arms at a lighter pace.", muscles: ["quadriceps", "middle_back", "shoulders", "biceps", "abdominals"] },
];

export function fixturePlanOutput(catalog: CatalogEntry[], intake: Intake): PlanOutput {
  const training =
    intake.preferredDays.length === intake.daysPerWeek ? [...intake.preferredDays].sort((a, b) => a - b) : spreadDays(intake.daysPerWeek);

  return {
    label: "Fixture week",
    summary:
      "Canned answer from fixture mode: full-body days built from your own library, with the last two movements of each day paired as a superset.",
    days: Array.from({ length: 7 }, (_, day_index) => {
      const position = training.indexOf(day_index);
      if (position === -1) {
        return { day_index, name: "Rest", focus_note: null, rest: true, progression: "double" as const, exercises: [] };
      }
      const shape = DAY_SHAPES[position % DAY_SHAPES.length]!;
      const used = new Set<string>();
      const picks = shape.muscles.flatMap((muscle) => {
        const entry = catalog.find((e) => e.primary_muscle === muscle && e.tracking !== "cardio" && !used.has(e.slug));
        if (!entry) return [];
        used.add(entry.slug);
        return [entry];
      });
      return {
        day_index,
        name: shape.name,
        focus_note: shape.focus,
        rest: false,
        progression: "double" as const,
        exercises: picks.map((entry, i) => ({
          slug: entry.slug,
          sets: 3,
          rep_min: entry.tracking === "reps" ? 8 : null,
          rep_max: entry.tracking === "reps" ? 12 : null,
          target_seconds: entry.tracking === "reps" ? null : 45,
          per_side: false,
          superset: picks.length >= 4 && i >= picks.length - 2 ? 1 : null,
          progression: null,
          why: `Fixture answer: covers ${entry.primary_muscle.replace("_", " ")} for this day.`,
        })),
      };
    }),
  };
}

/** A refine in fixture mode: the same week back, renamed, request noted. */
export function fixtureRefineOutput(previous: ValidPlan): PlanOutput {
  return {
    label: previous.label.endsWith("(revised)") ? previous.label : `${previous.label} (revised)`,
    summary: "Canned answer from fixture mode: your request was received; the week comes back unchanged apart from its name.",
    days: previous.days.map((day) => ({
      day_index: day.day_index,
      name: day.name,
      focus_note: day.focus_note,
      rest: day.is_rest,
      progression: day.progression,
      exercises: day.exercises.map((e) => ({
        slug: e.slug,
        sets: e.sets,
        rep_min: e.rep_min,
        rep_max: e.rep_max,
        target_seconds: e.target_seconds,
        per_side: e.per_side,
        superset: e.superset_group,
        progression: e.progression,
        why: e.note,
      })),
    })),
  };
}

export function fixtureReviewOutput(plan: PlanForModel): ReviewOutput {
  const day = plan.days.find((d) => !d.rest && d.exercises.length > 0);
  if (!day) {
    return {
      summary: "Canned answer from fixture mode: there is no training in the plan to review.",
      changes: [],
      advice: ["Fixture mode: add a training day and log a session, then review again."],
    };
  }
  const first = day.exercises[0]!;
  return {
    summary: "Canned answer from fixture mode: two example changes so the review screen can be tried end to end.",
    changes: [
      {
        type: "set_sets",
        day_index: day.day_index,
        exercise: first.slug,
        sets: first.sets >= 10 ? first.sets - 1 : first.sets + 1,
        rationale: "Fixture answer: an example change to the number of sets.",
      },
      {
        type: "rename_day",
        day_index: day.day_index,
        name: day.name.endsWith("(fixture)") ? day.name : `${day.name.slice(0, 29)} (fixture)`,
        focus_note: "Fixture answer: an example rename.",
        rationale: "Fixture answer: an example change to the day's name.",
      },
    ],
    advice: ["Fixture mode: these answers are canned. Set ANTHROPIC_API_KEY for real coaching."],
  };
}

/** Answers every request with `produce()`, after a short pause so progress shows. */
export function fixtureTransport(produce: () => unknown, delayMs = 1200): Transport {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const text = JSON.stringify(produce());
    return {
      text,
      content: [{ type: "text", text, citations: null }],
      usage: { input: 0, output: 0, cacheRead: 0 },
      stopReason: "end_turn",
    };
  };
}
