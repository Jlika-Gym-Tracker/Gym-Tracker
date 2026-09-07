/**
 * Starting points for someone who does not yet know what to write.
 *
 * The brief's first rule is that the user writes the program — no AI
 * generation. These templates keep that true: they are fixed, human-authored
 * blueprints that fill a draft week you then edit and publish. Nothing is
 * generated, nothing calls a model, and the same choice always produces the
 * same week.
 *
 * Each slot lists candidate exercises best-first. The resolver takes the first
 * one the person's equipment allows, so one blueprint serves a full gym, a pair
 * of dumbbells, or nothing at all.
 */

import type { LibraryExercise } from "./match";

export type EquipmentProfile = "full_gym" | "dumbbells" | "bodyweight";

export const EQUIPMENT_PROFILES: {
  key: EquipmentProfile;
  name: string;
  detail: string;
  allows: string[];
}[] = [
  {
    key: "full_gym",
    name: "Full gym",
    detail: "Barbells, machines, cables",
    allows: [
      "barbell", "dumbbell", "machine", "cable", "body_only",
      "ez_curl_bar", "kettlebells", "bands", "other",
    ],
  },
  {
    key: "dumbbells",
    name: "Dumbbells",
    detail: "A pair of dumbbells and a bench",
    allows: ["dumbbell", "body_only", "bands"],
  },
  {
    key: "bodyweight",
    name: "Bodyweight",
    detail: "Nothing but the floor and a bar to hang from",
    allows: ["body_only"],
  },
];

export type TemplateSlot = {
  /** What the slot is for, used when nothing in the library fits. */
  label: string;
  /** Exercise slugs, best first. The first one the equipment allows is used. */
  candidates: string[];
  sets: number;
  repMin: number;
  repMax: number | null;
  perSide?: boolean;
};

export type TemplateDay = {
  dayIndex: number;
  name: string;
  focusNote: string;
  slots: TemplateSlot[];
};

export type ProgramTemplate = {
  slug: string;
  name: string;
  level: "beginner" | "intermediate" | "advanced";
  daysPerWeek: number;
  summary: string;
  bestFor: string;
  /**
   * True when the template intentionally prescribes less than the load check's
   * weekly floor, so the UI can explain the warning instead of implying a
   * mistake.
   */
  belowFloorByDesign?: boolean;
  days: TemplateDay[];
};

const CORE: TemplateSlot = {
  label: "Core",
  candidates: ["hanging-leg-raise", "cable-crunch", "plank", "crunches"],
  sets: 3,
  repMin: 10,
  repMax: 15,
};

/**
 * Three full-body days is the right shape for a beginner: every muscle gets
 * three exposures a week, and missing one day costs less than missing one of
 * two upper days.
 */
const FULL_BODY_3: ProgramTemplate = {
  slug: "full-body-3",
  name: "3-day full body",
  level: "beginner",
  daysPerWeek: 3,
  summary: "Squat, push, pull and hinge three times a week.",
  bestFor:
    "Your first few months. Every session covers the whole body, so missing one costs little.",
  /**
   * Deliberately below the weekly set floor the load check uses. That floor is
   * tuned for an intermediate lifter holding muscle in a deficit; a beginner
   * grows on far less, and starting at 20 sets a muscle just buys soreness.
   */
  belowFloorByDesign: true,
  days: [
    {
      dayIndex: 0,
      name: "Full body A",
      focusNote:
        "Leave two reps in reserve on every set. Form first — the loads come later.",
      slots: [
        {
          label: "Squat",
          candidates: ["barbell-squat", "leg-press", "dumbbell-lunges", "split-squat-with-dumbbells"],
          sets: 3, repMin: 8, repMax: 12,
        },
        {
          label: "Horizontal push",
          candidates: ["barbell-bench-press-medium-grip", "dumbbell-bench-press", "pushups"],
          sets: 3, repMin: 8, repMax: 12,
        },
        {
          label: "Horizontal pull",
          candidates: ["seated-cable-rows", "one-arm-dumbbell-row", "bent-over-barbell-row"],
          sets: 3, repMin: 8, repMax: 12,
        },
        {
          label: "Hinge",
          candidates: ["romanian-deadlift", "lying-leg-curls", "barbell-glute-bridge"],
          sets: 3, repMin: 8, repMax: 10,
        },
        CORE,
      ],
    },
    {
      dayIndex: 2,
      name: "Full body B",
      focusNote: "Same movements, different angles. Add a rep before you add weight.",
      slots: [
        {
          label: "Hinge or deadlift",
          candidates: ["barbell-deadlift", "romanian-deadlift", "barbell-glute-bridge", "lying-leg-curls"],
          sets: 3, repMin: 5, repMax: 8,
        },
        {
          label: "Vertical push",
          candidates: ["standing-military-press", "dumbbell-shoulder-press", "machine-shoulder-military-press", "pushups"],
          sets: 3, repMin: 8, repMax: 12,
        },
        {
          label: "Vertical pull",
          candidates: ["wide-grip-lat-pulldown", "pullups", "chin-up"],
          sets: 3, repMin: 8, repMax: 12,
        },
        {
          label: "Single-leg",
          candidates: ["bulgarian-split-squat", "dumbbell-lunges", "barbell-walking-lunge"],
          sets: 3, repMin: 8, repMax: 10, perSide: true,
        },
        CORE,
      ],
    },
    {
      dayIndex: 4,
      name: "Full body C",
      focusNote: "The lightest day. If something aches, this is the one to trim.",
      slots: [
        {
          label: "Squat",
          candidates: ["front-barbell-squat", "hack-squat", "leg-press", "split-squat-with-dumbbells"],
          sets: 3, repMin: 8, repMax: 12,
        },
        {
          label: "Incline push",
          candidates: ["incline-dumbbell-press", "barbell-incline-bench-press-medium-grip", "leverage-chest-press", "pushups"],
          sets: 3, repMin: 8, repMax: 12,
        },
        {
          label: "Row",
          candidates: ["leverage-iso-row", "t-bar-row-with-handle", "one-arm-dumbbell-row", "pullups"],
          sets: 3, repMin: 10, repMax: 12,
        },
        {
          label: "Side delts",
          candidates: ["side-lateral-raise", "cable-seated-lateral-raise", "reverse-machine-flyes"],
          sets: 3, repMin: 12, repMax: 15,
        },
        {
          label: "Arms",
          candidates: ["ez-bar-curl", "dumbbell-bicep-curl", "chin-up"],
          sets: 3, repMin: 10, repMax: 15,
        },
      ],
    },
  ],
};

/** The split the seeded program uses — a sensible step up from full body. */
const UPPER_LOWER_4: ProgramTemplate = {
  slug: "upper-lower-4",
  name: "4-day upper / lower",
  level: "intermediate",
  daysPerWeek: 4,
  summary: "Two upper days, two lower days, one rest between each pair.",
  bestFor:
    "Once three full-body days stop being enough. Roughly an hour a session.",
  days: [
    {
      dayIndex: 0,
      name: "Upper A",
      focusNote:
        "Controlled reps, full range of motion and leaving 1–2 reps in reserve.",
      slots: [
        { label: "Incline push", candidates: ["incline-dumbbell-press", "barbell-incline-bench-press-medium-grip", "pushups"], sets: 3, repMin: 8, repMax: 12 },
        { label: "Vertical pull", candidates: ["wide-grip-lat-pulldown", "pullups"], sets: 3, repMin: 8, repMax: 12 },
        { label: "Chest", candidates: ["leverage-chest-press", "dumbbell-bench-press", "pushups"], sets: 3, repMin: 10, repMax: 12 },
        { label: "Row", candidates: ["seated-cable-rows", "one-arm-dumbbell-row"], sets: 3, repMin: 10, repMax: 12 },
        { label: "Side delts", candidates: ["side-lateral-raise", "cable-seated-lateral-raise"], sets: 3, repMin: 12, repMax: 15 },
        { label: "Triceps", candidates: ["triceps-pushdown", "dips-triceps-version"], sets: 3, repMin: 10, repMax: 15 },
        { label: "Biceps", candidates: ["ez-bar-curl", "dumbbell-bicep-curl", "chin-up"], sets: 3, repMin: 10, repMax: 15 },
      ],
    },
    {
      dayIndex: 1,
      name: "Lower A",
      focusNote: "Build strength without beating up your joints.",
      slots: [
        { label: "Squat", candidates: ["leg-press", "barbell-squat", "split-squat-with-dumbbells"], sets: 3, repMin: 8, repMax: 12 },
        { label: "Hinge", candidates: ["romanian-deadlift", "barbell-glute-bridge", "lying-leg-curls"], sets: 4, repMin: 8, repMax: 10 },
        { label: "Single-leg", candidates: ["barbell-walking-lunge", "dumbbell-lunges", "bulgarian-split-squat"], sets: 3, repMin: 10, repMax: 10, perSide: true },
        { label: "Quads", candidates: ["leg-extensions", "split-squat-with-dumbbells"], sets: 3, repMin: 12, repMax: 15 },
        { label: "Hamstrings", candidates: ["lying-leg-curls", "seated-leg-curl", "good-morning"], sets: 3, repMin: 10, repMax: 15 },
        { label: "Calves", candidates: ["standing-calf-raises", "donkey-calf-raises"], sets: 4, repMin: 12, repMax: 15 },
        CORE,
      ],
    },
    {
      dayIndex: 3,
      name: "Upper B",
      focusNote: "Different angles. Same muscle groups. More quality volume.",
      slots: [
        { label: "Flat push", candidates: ["dumbbell-bench-press", "barbell-bench-press-medium-grip", "pushups"], sets: 4, repMin: 8, repMax: 12 },
        { label: "Close pull", candidates: ["close-grip-front-lat-pulldown", "chin-up"], sets: 3, repMin: 8, repMax: 12 },
        { label: "Supported row", candidates: ["leverage-iso-row", "t-bar-row-with-handle", "one-arm-dumbbell-row"], sets: 3, repMin: 10, repMax: 12 },
        { label: "Shoulder press", candidates: ["machine-shoulder-military-press", "dumbbell-shoulder-press", "standing-military-press"], sets: 3, repMin: 8, repMax: 12 },
        { label: "Side delts", candidates: ["cable-seated-lateral-raise", "side-lateral-raise"], sets: 4, repMin: 12, repMax: 15 },
        { label: "Triceps", candidates: ["cable-rope-overhead-triceps-extension", "lying-triceps-press", "dips-triceps-version"], sets: 3, repMin: 10, repMax: 15 },
        { label: "Biceps", candidates: ["incline-dumbbell-curl", "hammer-curls", "chin-up"], sets: 3, repMin: 10, repMax: 15 },
      ],
    },
    {
      dayIndex: 4,
      name: "Lower B",
      focusNote: "Train hard, recover well and come back stronger next week.",
      slots: [
        { label: "Squat", candidates: ["hack-squat", "front-barbell-squat", "leg-press", "dumbbell-lunges"], sets: 3, repMin: 8, repMax: 12 },
        { label: "Single-leg", candidates: ["bulgarian-split-squat", "split-squat-with-dumbbells", "dumbbell-lunges"], sets: 3, repMin: 8, repMax: 8, perSide: true },
        { label: "Hamstrings", candidates: ["seated-leg-curl", "lying-leg-curls", "good-morning"], sets: 3, repMin: 10, repMax: 15 },
        { label: "Quads", candidates: ["leg-extensions", "split-squat-with-dumbbells"], sets: 3, repMin: 12, repMax: 15 },
        { label: "Calves", candidates: ["seated-calf-raise", "standing-calf-raises", "donkey-calf-raises"], sets: 4, repMin: 12, repMax: 15 },
        CORE,
      ],
    },
  ],
};

const PPL_6: ProgramTemplate = {
  slug: "push-pull-legs-6",
  name: "6-day push / pull / legs",
  level: "advanced",
  daysPerWeek: 6,
  summary: "Each pattern twice a week, one rest day.",
  bestFor:
    "When you can recover from six sessions and want the volume. Not a starting point.",
  days: [0, 1, 2, 3, 4, 5].map((dayIndex) => {
    const kind = dayIndex % 3;
    if (kind === 0) {
      return {
        dayIndex,
        name: dayIndex === 0 ? "Push A" : "Push B",
        focusNote: "Chest, shoulders and triceps. Stop one rep short on the last set.",
        slots: [
          { label: "Press", candidates: dayIndex === 0 ? ["barbell-bench-press-medium-grip", "dumbbell-bench-press", "pushups"] : ["incline-dumbbell-press", "barbell-incline-bench-press-medium-grip", "pushups"], sets: 4, repMin: 6, repMax: 10 },
          { label: "Second press", candidates: ["leverage-chest-press", "dumbbell-flyes", "pushups"], sets: 3, repMin: 10, repMax: 12 },
          { label: "Shoulder press", candidates: ["standing-military-press", "seated-dumbbell-press", "machine-shoulder-military-press"], sets: 3, repMin: 8, repMax: 12 },
          { label: "Side delts", candidates: ["side-lateral-raise", "cable-seated-lateral-raise"], sets: 4, repMin: 12, repMax: 15 },
          { label: "Triceps", candidates: ["triceps-pushdown", "lying-triceps-press", "dips-triceps-version"], sets: 3, repMin: 10, repMax: 15 },
        ],
      };
    }
    if (kind === 1) {
      return {
        dayIndex,
        name: dayIndex === 1 ? "Pull A" : "Pull B",
        focusNote: "Back and biceps. Pull with the elbows, not the hands.",
        slots: [
          { label: "Vertical pull", candidates: dayIndex === 1 ? ["pullups", "wide-grip-lat-pulldown"] : ["close-grip-front-lat-pulldown", "chin-up"], sets: 4, repMin: 6, repMax: 10 },
          { label: "Row", candidates: ["bent-over-barbell-row", "seated-cable-rows", "one-arm-dumbbell-row"], sets: 3, repMin: 8, repMax: 12 },
          { label: "Supported row", candidates: ["leverage-iso-row", "t-bar-row-with-handle", "one-arm-dumbbell-row"], sets: 3, repMin: 10, repMax: 12 },
          { label: "Rear delts", candidates: ["face-pull", "reverse-machine-flyes", "barbell-rear-delt-row"], sets: 3, repMin: 12, repMax: 15 },
          { label: "Biceps", candidates: ["barbell-curl", "dumbbell-bicep-curl", "chin-up"], sets: 3, repMin: 10, repMax: 15 },
        ],
      };
    }
    return {
      dayIndex,
      name: dayIndex === 2 ? "Legs A" : "Legs B",
      focusNote: "Everything below the waist. Depth before load.",
      slots: [
        { label: "Squat", candidates: dayIndex === 2 ? ["barbell-squat", "leg-press", "dumbbell-lunges"] : ["hack-squat", "front-barbell-squat", "split-squat-with-dumbbells"], sets: 4, repMin: 6, repMax: 10 },
        { label: "Hinge", candidates: ["romanian-deadlift", "barbell-glute-bridge", "lying-leg-curls"], sets: 3, repMin: 8, repMax: 10 },
        { label: "Single-leg", candidates: ["bulgarian-split-squat", "barbell-walking-lunge", "dumbbell-lunges"], sets: 3, repMin: 8, repMax: 10, perSide: true },
        { label: "Hamstrings", candidates: ["seated-leg-curl", "lying-leg-curls", "good-morning"], sets: 3, repMin: 10, repMax: 15 },
        { label: "Calves", candidates: ["standing-calf-raises", "seated-calf-raise", "donkey-calf-raises"], sets: 4, repMin: 12, repMax: 15 },
        CORE,
      ],
    };
  }),
};

export const TEMPLATES: ProgramTemplate[] = [FULL_BODY_3, UPPER_LOWER_4, PPL_6];

export function findTemplate(slug: string): ProgramTemplate | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export type ResolvedExercise = {
  exerciseId: string;
  name: string;
  targetSets: number;
  repMin: number;
  repMax: number | null;
  perSide: boolean;
};

export type ResolvedDay = {
  dayIndex: number;
  name: string;
  focusNote: string;
  exercises: ResolvedExercise[];
  /** Slot labels nothing in the library could fill with this equipment. */
  unfilled: string[];
};

export type ResolvedTemplate = {
  template: ProgramTemplate;
  days: ResolvedDay[];
  unfilled: string[];
};

/**
 * Turns a blueprint into real exercises from the library.
 *
 * Slots whose candidates are all unavailable are reported rather than silently
 * dropped — a bodyweight-only week with no hinge should say so, not quietly
 * hand back a week missing a movement pattern.
 */
export function resolveTemplate(
  template: ProgramTemplate,
  library: LibraryExercise[],
  equipment: EquipmentProfile,
): ResolvedTemplate {
  const allowed = new Set(
    EQUIPMENT_PROFILES.find((p) => p.key === equipment)?.allows ?? [],
  );
  const bySlug = new Map(library.map((e) => [e.slug, e]));
  const unfilled: string[] = [];

  const days = template.days.map((day) => {
    const exercises: ResolvedExercise[] = [];
    const dayUnfilled: string[] = [];
    const usedInDay = new Set<string>();

    for (const slot of day.slots) {
      const pick = slot.candidates
        .map((slug) => bySlug.get(slug))
        .find(
          (exercise) =>
            exercise && allowed.has(exercise.equipment) && !usedInDay.has(exercise.id),
        );

      if (!pick) {
        dayUnfilled.push(slot.label);
        unfilled.push(`${day.name}: ${slot.label}`);
        continue;
      }

      usedInDay.add(pick.id);
      exercises.push({
        exerciseId: pick.id,
        name: pick.name,
        targetSets: slot.sets,
        repMin: slot.repMin,
        repMax: slot.repMax,
        perSide: slot.perSide ?? false,
      });
    }

    return {
      dayIndex: day.dayIndex,
      name: day.name,
      focusNote: day.focusNote,
      exercises,
      unfilled: dayUnfilled,
    };
  });

  return { template, days, unfilled };
}
