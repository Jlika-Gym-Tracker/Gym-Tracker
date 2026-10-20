/**
 * Model answers in the shape structured output returns them: a JSON string in
 * one text block. Written to look like real replies — including the slips a
 * real reply makes — so the checks are tested against what they will meet.
 */

const rest = (day_index: number) => ({
  day_index,
  name: "Rest",
  focus_note: null,
  rest: true,
  progression: "double",
  exercises: [],
});

/** A good four-day upper/lower week. Day 3 has a redundant override and a lone superset member. */
export const PLAN_REPLY = JSON.stringify({
  label: "Upper / Lower · 4 days",
  summary:
    "Two upper and two lower days, Monday-Tuesday and Thursday-Friday, so every muscle is trained twice. Heavy compounds run on linear progression while you are early on; accessories use double progression.",
  days: [
    {
      day_index: 0,
      name: "Upper A",
      focus_note: "Heavy press and row, then shoulders and arms.",
      rest: false,
      progression: "linear",
      exercises: [
        { slug: "barbell-bench-press-medium-grip", sets: 3, rep_min: 5, rep_max: 5, target_seconds: null, per_side: false, superset: null, progression: null, why: "Your main horizontal press; heavy fives build pressing strength." },
        { slug: "bent-over-barbell-row", sets: 3, rep_min: 6, rep_max: 8, target_seconds: null, per_side: false, superset: null, progression: null, why: "Balances the bench with an equally heavy pull for your upper back." },
        { slug: "side-lateral-raise", sets: 3, rep_min: 12, rep_max: 15, target_seconds: null, per_side: false, superset: 1, progression: "double", why: "Builds the side of your shoulders, which pressing barely reaches." },
        { slug: "triceps-pushdown", sets: 3, rep_min: 10, rep_max: 12, target_seconds: null, per_side: false, superset: 1, progression: "double", why: "Extra triceps work, paired with raises to save you time." },
      ],
    },
    {
      day_index: 1,
      name: "Lower A",
      focus_note: "Squat-led, then hamstrings and core.",
      rest: false,
      progression: "linear",
      exercises: [
        { slug: "barbell-squat", sets: 3, rep_min: 5, rep_max: 5, target_seconds: null, per_side: false, superset: null, progression: null, why: "The backbone of your lower-body strength." },
        { slug: "romanian-deadlift", sets: 3, rep_min: 8, rep_max: 10, target_seconds: null, per_side: false, superset: null, progression: "double", why: "Trains your hamstrings through a long range without heavy spinal loading." },
        { slug: "plank", sets: 3, rep_min: null, rep_max: null, target_seconds: 40, per_side: false, superset: null, progression: "time", why: "Teaches you to brace, which carries straight into your squat." },
      ],
    },
    rest(2),
    {
      day_index: 3,
      name: "Upper B",
      focus_note: "Vertical press and pull.",
      rest: false,
      progression: "double",
      exercises: [
        { slug: "dumbbell-shoulder-press", sets: 3, rep_min: 8, rep_max: 12, target_seconds: null, per_side: false, superset: null, progression: "double", why: "Overhead pressing with dumbbells is easier on your shoulders." },
        { slug: "wide-grip-lat-pulldown", sets: 3, rep_min: 8, rep_max: 12, target_seconds: null, per_side: false, superset: null, progression: null, why: "Builds your lats so pull-ups come within reach." },
        { slug: "hammer-curls", sets: 2, rep_min: 10, rep_max: 12, target_seconds: null, per_side: false, superset: 2, progression: null, why: "Arm work that also strengthens your grip." },
      ],
    },
    {
      day_index: 4,
      name: "Lower B",
      focus_note: "Single-leg work and calves.",
      rest: false,
      progression: "double",
      exercises: [
        { slug: "bulgarian-split-squat", sets: 3, rep_min: 8, rep_max: 10, target_seconds: null, per_side: true, superset: null, progression: null, why: "Evens out your legs one side at a time." },
        { slug: "lying-leg-curls", sets: 3, rep_min: 10, rep_max: 12, target_seconds: null, per_side: false, superset: null, progression: null, why: "Direct hamstring work the hinge alone doesn't give you." },
        { slug: "standing-calf-raises", sets: 3, rep_min: 10, rep_max: 15, target_seconds: null, per_side: false, superset: null, progression: null, why: "Calves respond to frequent, full-range work." },
      ],
    },
    rest(5),
    rest(6),
  ],
});

/** The kind of reply a repair round exists for: an invented slug and a plank with reps. */
export const BROKEN_PLAN_REPLY = JSON.stringify({
  ...JSON.parse(PLAN_REPLY),
  days: (JSON.parse(PLAN_REPLY).days as { day_index: number; exercises: Record<string, unknown>[] }[]).map((day) =>
    day.day_index === 1
      ? {
          ...day,
          exercises: [
            ...day.exercises.slice(0, 2),
            { slug: "plank", sets: 3, rep_min: 30, rep_max: 60, target_seconds: null, per_side: false, superset: null, progression: null, why: "Core." },
            { slug: "nordic-hamstring-curl", sets: 3, rep_min: 5, rep_max: 8, target_seconds: null, per_side: false, superset: null, progression: null, why: "Hamstrings." },
          ],
        }
      : day,
  ),
});

/** A review of the PLAN_REPLY week after four weeks of training. */
export const REVIEW_REPLY = JSON.stringify({
  summary:
    "Bench has stalled for three sessions with RPE climbing to 9.5, while lateral raises are consistently above range. Everything else is moving.",
  changes: [
    {
      type: "set_rep_range",
      day_index: 0,
      exercise: "barbell-bench-press-medium-grip",
      rep_min: 6,
      rep_max: 8,
      rationale: "Three sessions without beating 80 kg × 5 and RPE rose from 8 to 9.5; a slightly lighter, higher-rep block should restart progress.",
    },
    {
      type: "set_sets",
      day_index: 0,
      exercise: "side-lateral-raise",
      sets: 4,
      rationale: "9 of 9 sets landed above the top of the range at RPE 7; there is room for more volume.",
    },
    {
      type: "swap_exercise",
      day_index: 4,
      exercise: "bulgarian-split-squat",
      to_exercise: "dumbbell-lunges",
      why: "Lunges train the same pattern with an easier setup.",
      rationale: "Rated brutal twice and 5 of 12 sets skipped; the note says the setup takes too long.",
    },
  ],
  advice: ["Body weight is down 0.4 kg a week, in line with your goal — keep eating to that target."],
});
