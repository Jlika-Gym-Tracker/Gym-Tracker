/**
 * Matches parsed exercise names against the library.
 *
 * People write "Hamstring Curl" for "Lying Leg Curls" and "Machine Chest Press"
 * for "Leverage Chest Press", so an exact-name lookup would send most of a
 * pasted week to the review step. Seeded rows carry an `aliases` array for the
 * common shorthands; anything past that falls back to token overlap.
 */

export type LibraryExercise = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  primary_muscle: string;
  equipment: string;
  image_start_url: string | null;
};

export type MatchCandidate = { exercise: LibraryExercise; score: number };

export type MatchOutcome<T> = {
  parsed: T;
  /** Filled when confident enough to use without asking. */
  matched: LibraryExercise | null;
  /** Best few options, always populated, for the review step's dropdown. */
  candidates: MatchCandidate[];
};

/** Above this, take the match. Below, ask. Tuned against the seeded library. */
export const AUTO_MATCH_THRESHOLD = 0.62;

const STOP_WORDS = new Set(["the", "a", "with", "and", "of", "on", "to"]);

/** Singular/plural and spelling variants that should not cost a match. */
const SYNONYMS: Record<string, string> = {
  db: "dumbbell",
  bb: "barbell",
  ez: "ezbar",
  "e-z": "ezbar",
  tricep: "triceps",
  bicep: "biceps",
  ohp: "overheadpress",
  rdl: "romaniandeadlift",
  pulldowns: "pulldown",
  rows: "row",
  raises: "raise",
  curls: "curl",
  presses: "press",
  press: "press",
  extensions: "extension",
  crunches: "crunch",
  squats: "squat",
  lunges: "lunge",
  pushups: "pushup",
  pullups: "pullup",
  "push-ups": "pushup",
  dips: "dip",
  flyes: "fly",
  flies: "fly",
  machines: "machine",
  cables: "cable",
  legs: "leg",
  hamstrings: "hamstring",
  seated: "seated",
};

export function normalize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t && !STOP_WORDS.has(t))
    .map((t) => SYNONYMS[t] ?? t.replace(/s$/, ""));
}

/** Sørensen–Dice over token sets: forgiving about word order, strict about content. */
function tokenScore(a: string, b: string): number {
  const A = new Set(normalize(a));
  const B = new Set(normalize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return (2 * shared) / (A.size + B.size);
}

export function scoreExercise(query: string, exercise: LibraryExercise): number {
  // An alias or name hit is an exact answer, not a similarity.
  const target = [exercise.name, ...exercise.aliases];
  for (const t of target) {
    if (normalize(t).join(" ") === normalize(query).join(" ")) return 1;
  }
  return Math.max(...target.map((t) => tokenScore(query, t)));
}

export function findCandidates(
  query: string,
  library: LibraryExercise[],
  limit = 4,
): MatchCandidate[] {
  return library
    .map((exercise) => ({ exercise, score: scoreExercise(query, exercise) }))
    .filter((c) => c.score > 0.15)
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
    .slice(0, limit);
}

export function matchExercises<T extends { name: string }>(
  parsed: T[],
  library: LibraryExercise[],
): MatchOutcome<T>[] {
  return parsed.map((item) => {
    const candidates = findCandidates(item.name, library);
    const best = candidates[0];
    return {
      parsed: item,
      matched: best && best.score >= AUTO_MATCH_THRESHOLD ? best.exercise : null,
      candidates,
    };
  });
}
