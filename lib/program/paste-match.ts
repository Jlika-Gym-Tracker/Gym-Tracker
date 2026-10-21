/**
 * Matching a pasted week against the library, aware of how each line reads.
 *
 * "Plank: 3 × 30 sec" should land on a timed movement and "Cardio: 10 min
 * easy cycling" on a cardio one, so those lines are matched against movements
 * logged the same way first. When nothing there is a confident answer, the
 * whole library is tried, with the same-kind candidates still listed first in
 * the review dropdown.
 */

import type { ParsedExercise } from "./parse";
import {
  confidentMatch,
  findCandidates,
  type LibraryExercise,
  type MatchCandidate,
  type MatchOutcome,
} from "./match";

export function matchPasted(
  exercises: ParsedExercise[],
  library: LibraryExercise[],
): MatchOutcome<ParsedExercise>[] {
  const byKind = new Map<string, LibraryExercise[]>();
  for (const exercise of library) {
    const kind = exercise.tracking ?? "reps";
    const list = byKind.get(kind) ?? [];
    list.push(exercise);
    byKind.set(kind, list);
  }

  return exercises.map((parsed) => {
    const everything = findCandidates(parsed.name, library);
    if (parsed.kind === "reps") {
      return { parsed, matched: confidentMatch(everything), candidates: everything };
    }

    const pool = byKind.get(parsed.kind) ?? [];
    const sameKind = findCandidates(parsed.name, pool);
    const confident = confidentMatch(sameKind) ?? confidentMatch(everything);
    const seen = new Set<string>();
    const candidates: MatchCandidate[] = [];
    for (const c of [...sameKind, ...everything]) {
      if (seen.has(c.exercise.id)) continue;
      seen.add(c.exercise.id);
      candidates.push(c);
    }
    return { parsed, matched: confident, candidates: candidates.slice(0, 5) };
  });
}
