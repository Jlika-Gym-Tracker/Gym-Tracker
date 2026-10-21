import type { Equipment, Muscle, Tracking } from "@/lib/database.types";
import type { ExerciseSummary } from "./types";

/**
 * First guesses for an exercise the library doesn't have, so creating it is
 * usually one tap. These only pre-fill the review step's selects — the lifter
 * sees every guess and can change it before anything is written.
 */

export const MUSCLES: Muscle[] = [
  "chest", "lats", "middle_back", "lower_back", "traps", "shoulders", "biceps",
  "triceps", "forearms", "quadriceps", "hamstrings", "glutes", "calves",
  "abdominals", "abductors", "adductors", "neck",
];

export const EQUIPMENT: Equipment[] = [
  "barbell", "dumbbell", "machine", "cable", "body_only", "bands", "kettlebells",
  "ez_curl_bar", "exercise_ball", "medicine_ball", "foam_roll", "other",
];

export const TRACKING: Tracking[] = ["reps", "time", "cardio"];

const CARDIO =
  /\b(run|running|jog|jogging|treadmill|bike|biking|cycling|cycle|spin|elliptical|cross ?trainer|stair|stairmaster|stepper|walk|walking|hike|swim|swimming|rowing|rower|erg|jump rope|skipping|sprint)\b/;

/**
 * Ordered: the first rule that matches wins, so the specific ones come first —
 * "Leg Curl" must reach hamstrings before the bare "curl" rule claims it for
 * biceps, and "Rowing Machine" must count as cardio before "row" means back.
 */
const MUSCLE_RULES: [RegExp, Muscle][] = [
  [/\b(wrist|forearms?|farmers?|farmer's)\b/, "forearms"],
  [CARDIO, "quadriceps"],
  [/\b(leg curls?|hamstring|romanian|rdl|stiff[- ]?leg(ged)?|good ?mornings?|nordic)\b/, "hamstrings"],
  [/\bcalf|\bcalves\b/, "calves"],
  [/\b(hip thrusts?|glutes?|bridges?|donkey kicks?)\b/, "glutes"],
  [/\babduct/, "abductors"],
  [/\badduct/, "adductors"],
  [/\b(triceps?|pushdowns?|push-downs?|skull ?crushers?|close[- ]grip bench|jm press|kickbacks?)\b/, "triceps"],
  [/\b(curls?|biceps?)\b/, "biceps"],
  [/\bshrugs?\b/, "traps"],
  [/\bneck\b/, "neck"],
  [/\b(face pulls?|rear delts?|reverse fl(y|ies|yes)|lateral raises?|side raises?|front raises?|upright rows?|shoulder press|overhead press|military|arnold|ohp|delts?|push press|shoulders?)\b/, "shoulders"],
  [/\b(deadlifts?|back extensions?|hyperextensions?|supermans?)\b/, "lower_back"],
  [/\b(pull[- ]?downs?|pull[- ]?ups?|chin[- ]?ups?|lats?|pullovers?)\b/, "lats"],
  [/\b(rows?|t-bar)\b/, "middle_back"],
  [/\b(bench|chest|fl(y|ies|yes)|pec|pecs|push[- ]?ups?|dips?|crossovers?)\b/, "chest"],
  [/\b(crunch(es)?|planks?|sit[- ]?ups?|abs?|core|leg raises?|knee raises?|russian twists?|obliques?|wood ?chops?|hollow|rollouts?|ab wheel|v[- ]?ups?|dead ?bugs?|pallof)\b/, "abdominals"],
  [/\b(squats?|leg press|lunges?|leg extensions?|step[- ]?ups?|hack|sissy|wall sits?)\b/, "quadriceps"],
];

/** FitNotes' default categories, plus the common ones people add. */
const CATEGORY_MUSCLE: Record<string, Muscle> = {
  chest: "chest", back: "lats", lats: "lats", "upper back": "middle_back",
  "middle back": "middle_back", "lower back": "lower_back", traps: "traps",
  shoulders: "shoulders", delts: "shoulders", biceps: "biceps", triceps: "triceps",
  arms: "biceps", forearms: "forearms", legs: "quadriceps", quads: "quadriceps",
  quadriceps: "quadriceps", hamstrings: "hamstrings", glutes: "glutes",
  calves: "calves", abs: "abdominals", core: "abdominals", abdominals: "abdominals",
  cardio: "quadriceps", neck: "neck", "full body": "quadriceps", olympic: "quadriceps",
};

const clean = (name: string) => name.toLowerCase().replace(/[()[\]_,]/g, " ").replace(/\s+/g, " ").trim();

/**
 * The name's own words beat the file's category: FitNotes files "Leg Curl"
 * under Legs, which says quadriceps, while the name says hamstrings.
 */
export function guessMuscle(name: string, category: string | null): Muscle {
  const n = clean(name);
  for (const [pattern, muscle] of MUSCLE_RULES) if (pattern.test(n)) return muscle;
  const fromCategory = category ? CATEGORY_MUSCLE[clean(category)] : undefined;
  return fromCategory ?? "chest";
}

/**
 * Strong and Hevy put the equipment in brackets — "Bench Press (Barbell)",
 * "Lat Pulldown (Cable)" — and the rest usually say it somewhere in the name.
 */
const EQUIPMENT_RULES: [RegExp, Equipment][] = [
  [/\bsmith\b/, "machine"],
  [/\b(ez|e-z)( ?curl)?( ?bar)?\b/, "ez_curl_bar"],
  [/\b(barbell|bb|trap bar|hex bar)\b/, "barbell"],
  [/\b(dumbbells?|dumbells?|db)\b/, "dumbbell"],
  [/\b(kettlebells?|kb)\b/, "kettlebells"],
  [/\b(cable|pulley|pull[- ]?down|push[- ]?down|crossover|face pull)s?\b/, "cable"],
  [/\b(jump rope|skipping)\b/, "other"],
  [/\brope\b/, "cable"],
  [/\bbands?\b/, "bands"],
  [/\b(medicine ball|med ball|slam ball|wall ball)s?\b/, "medicine_ball"],
  [/\b(stability ball|swiss ball|exercise ball|physio ball)s?\b/, "exercise_ball"],
  [/\bfoam roll/, "foam_roll"],
  [/\b(machine|lever|leverage|hammer strength|plate loaded|sled|leg press|hack squat|pec deck|treadmill|elliptical|stairmaster|stair|bike|rower|rowing|erg|leg extension|leg curl)\b/, "machine"],
  [/\b(body ?weight|bw|push[- ]?ups?|pull[- ]?ups?|chin[- ]?ups?|dips?|planks?|crunch(es)?|sit[- ]?ups?|burpees?|air squats?|hanging)\b/, "body_only"],
];

export function guessEquipment(name: string): Equipment {
  const n = clean(name);
  for (const [pattern, equipment] of EQUIPMENT_RULES) if (pattern.test(n)) return equipment;
  return "other";
}

/**
 * How it was logged decides how it should be logged: any distance means cardio,
 * and time with no reps means a hold — unless the name says it's cardio.
 */
export function guessTracking(summary: Pick<ExerciseSummary, "name" | "hasDistance" | "hasDuration" | "hasReps">): Tracking {
  if (summary.hasDistance) return "cardio";
  if (summary.hasDuration && !summary.hasReps) {
    const n = clean(summary.name);
    // A farmer's walk or a walking lunge is timed or counted, not cardio.
    const loaded = /\b(farmers?|farmer's|carry|carries|lunges?)\b/.test(n);
    return CARDIO.test(n) && !loaded ? "cardio" : "time";
  }
  return "reps";
}

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: "Chest", lats: "Lats", middle_back: "Middle back", lower_back: "Lower back",
  traps: "Traps", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps",
  forearms: "Forearms", quadriceps: "Quads", hamstrings: "Hamstrings", glutes: "Glutes",
  calves: "Calves", abdominals: "Abs", abductors: "Abductors", adductors: "Adductors",
  neck: "Neck",
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: "Barbell", dumbbell: "Dumbbell", machine: "Machine", cable: "Cable",
  body_only: "Bodyweight", bands: "Bands", kettlebells: "Kettlebell",
  ez_curl_bar: "EZ bar", exercise_ball: "Exercise ball", medicine_ball: "Medicine ball",
  foam_roll: "Foam roller", other: "Other",
};

export const TRACKING_LABELS: Record<Tracking, string> = {
  reps: "Weight × reps",
  time: "Time",
  cardio: "Cardio",
};
