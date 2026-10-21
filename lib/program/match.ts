/**
 * Matches parsed exercise names against the library.
 *
 * People write "Hamstring Curl" for "Lying Leg Curls" and "Machine Chest Press"
 * for "Leverage Chest Press", so an exact-name lookup would send most of a
 * pasted week to the review step. Seeded rows carry an `aliases` array for the
 * common shorthands; anything past that falls back to token overlap.
 *
 * The library holds the curated (featured) movements and, behind them, the
 * whole of free-exercise-db. A short, common name — "Calf Raise", "Lunges",
 * "Shoulder Press" — overlaps a dozen long-tail rows about as well as it
 * overlaps the curated one, so close calls go to the featured row (or the
 * person's own). A specific name still finds its specific movement: "Sumo
 * Deadlift" is an exact hit, and an exact hit always wins.
 */

export type LibraryExercise = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  primary_muscle: string;
  equipment: string;
  image_start_url: string | null;
  /** How it is logged. Optional so callers holding older rows still type-check. */
  tracking?: "reps" | "time" | "cardio";
  /** Set on the user's own movements; null for the shared library. */
  owner_id?: string | null;
  /** A curated movement, ranked ahead of the long tail. Absent counts as not. */
  featured?: boolean;
  /** Removed by its owner. Libraries handed to the matcher leave these out. */
  archived_at?: string | null;
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

/**
 * How far a featured movement (or your own) may trail and still rank first.
 * One token's difference between short names moves a score by 0.05–0.06
 * (0.86 against 0.8), which is noise; a different movement costs more.
 */
export const PREFERRED_EDGE = 0.06;

/**
 * Words that carry no identity. The intensity words come from cardio lines —
 * "easy cycling", "brisk treadmill walk" — where they describe the effort, not
 * the machine, and would otherwise cost a match.
 */
const STOP_WORDS = new Set([
  "the", "a", "with", "and", "of", "on", "to",
  "easy", "brisk", "light", "moderate", "steady", "slow",
]);

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
  // Cardio: what people write against what the library calls it.
  cycling: "bike",
  cycle: "bike",
  biking: "bike",
  bicycling: "bike",
  bicycle: "bike",
  walking: "walk",
  running: "run",
  jogging: "jog",
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

/** A curated movement or one of the person's own: what close calls go to. */
export function isPreferred(exercise: LibraryExercise): boolean {
  return exercise.featured === true || exercise.owner_id != null;
}

/**
 * Each name and alias of an exercise, normalised once. A library of ~900 rows
 * is scored against every keystroke and every pasted line, so the work of
 * normalising its side is not repeated.
 */
const targetCache = new WeakMap<LibraryExercise, string[][]>();
function targets(exercise: LibraryExercise): string[][] {
  let cached = targetCache.get(exercise);
  if (!cached) {
    cached = [exercise.name, ...exercise.aliases].map(normalize);
    targetCache.set(exercise, cached);
  }
  return cached;
}

/** Sørensen–Dice over token sets: forgiving about word order, strict about content. */
function dice(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return (2 * shared) / (A.size + B.size);
}

function scoreTokens(query: readonly string[], exercise: LibraryExercise): number {
  const joined = query.join(" ");
  let best = 0;
  for (const target of targets(exercise)) {
    // An alias or name hit is an exact answer, not a similarity.
    if (target.join(" ") === joined) return 1;
    best = Math.max(best, dice(query, target));
  }
  return best;
}

export function scoreExercise(query: string, exercise: LibraryExercise): number {
  return scoreTokens(normalize(query), exercise);
}

/**
 * Ranking for close calls. An exact hit beats everything; otherwise a
 * preferred row gets PREFERRED_EDGE on top of its score. The edge only
 * orders candidates — `score` stays the raw similarity, so the auto-match
 * threshold means what it always meant.
 */
function compareCandidates(a: MatchCandidate, b: MatchCandidate): number {
  const rank = (c: MatchCandidate) =>
    c.score === 1 ? 2 : c.score + (isPreferred(c.exercise) ? PREFERRED_EDGE : 0);
  return (
    rank(b) - rank(a) ||
    Number(isPreferred(b.exercise)) - Number(isPreferred(a.exercise)) ||
    b.score - a.score ||
    a.exercise.name.localeCompare(b.exercise.name)
  );
}

export function findCandidates(
  query: string,
  library: LibraryExercise[],
  limit = 4,
): MatchCandidate[] {
  const tokens = normalize(query);
  return library
    .map((exercise) => ({ exercise, score: scoreTokens(tokens, exercise) }))
    .filter((c) => c.score > 0.15)
    .sort(compareCandidates)
    .slice(0, limit);
}

/**
 * The candidate to use without asking, or null. The best one must clear the
 * threshold, and a dead heat in the long tail is a guess rather than an
 * answer — "Shrug" is as much Barbell Shrug as Dumbbell Shrug — so that goes
 * to the review step. Ties among curated rows keep their old behaviour.
 */
export function confidentMatch(candidates: readonly MatchCandidate[]): LibraryExercise | null {
  const [best, next] = candidates;
  if (!best || best.score < AUTO_MATCH_THRESHOLD) return null;
  const guess =
    best.score < 1 && !isPreferred(best.exercise) && next != null && next.score >= best.score;
  return guess ? null : best.exercise;
}

export function matchExercises<T extends { name: string }>(
  parsed: T[],
  library: LibraryExercise[],
): MatchOutcome<T>[] {
  return parsed.map((item) => {
    const candidates = findCandidates(item.name, library);
    return { parsed: item, matched: confidentMatch(candidates), candidates };
  });
}

/**
 * Search-box ranking, for a library people browse as they type.
 *
 * A row whose name (or an alias) has a word starting with every word typed
 * so far is a hit — "benc pre" already finds the bench presses. Hits come
 * first: exact names, then featured and your own, then the rest by
 * similarity. Rows that only share a word come after, by the paste matcher's
 * score. With nothing typed, the library comes back as it was given.
 */
export function searchLibrary<T extends LibraryExercise>(
  query: string,
  library: readonly T[],
  limit = Infinity,
): T[] {
  // Each word typed, as typed and as normalised: "db" must reach "dumbbell",
  // and a half-typed "pres" (normalised to "pre") is still a prefix.
  const typed = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t && !STOP_WORDS.has(t));
  if (typed.length === 0) return library.slice(0, limit);
  const words = normalize(query);
  const forms = typed.map((t) => [t, SYNONYMS[t] ?? t.replace(/s$/, "")]);

  const ranked: { exercise: T; hit: boolean; score: number }[] = [];
  for (const exercise of library) {
    const score = scoreTokens(words, exercise);
    const hit = targets(exercise).some((target) =>
      forms.every((word) => target.some((t) => word.some((w) => t.startsWith(w)))),
    );
    if (hit || score > 0.15) ranked.push({ exercise, hit, score });
  }

  return ranked
    .sort(
      (a, b) =>
        Number(b.hit) - Number(a.hit) ||
        Number(b.score === 1) - Number(a.score === 1) ||
        Number(isPreferred(b.exercise)) - Number(isPreferred(a.exercise)) ||
        b.score - a.score ||
        a.exercise.name.localeCompare(b.exercise.name),
    )
    .slice(0, limit)
    .map((r) => r.exercise);
}
