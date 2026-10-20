/**
 * The Exercises page's filters, as pure functions over the library.
 *
 * Filtering happens on the server and only the rows on screen are sent, so a
 * library of ~760 movements costs the page a few dozen rows of HTML, not a
 * client bundle. Every filter lives in the URL: chips are plain links, the
 * page works without JavaScript, and Back undoes a filter.
 */

import type { Tracking } from "@/lib/database.types";
import { isPreferred, searchLibrary, type LibraryExercise } from "@/lib/program/match";
import { EQUIPMENT_LABEL, MUSCLE_GROUPS, sortEquipment } from "./taxonomy";

/** Rows per "show more". */
export const BROWSE_PAGE = 40;
const MAX_SHOWN = 2000;

const TRACKINGS: readonly Tracking[] = ["reps", "time", "cardio"];

export type BrowseParams = {
  q: string;
  /** A MUSCLE_GROUPS key, or null for every muscle. */
  group: string | null;
  equipment: string[];
  tracking: Tracking | null;
  /** How many rows to draw. */
  shown: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** Reads the URL, dropping anything it does not recognise rather than failing. */
export function parseBrowseParams(raw: RawParams): BrowseParams {
  const group = first(raw.group);
  const tracking = first(raw.as);
  const shown = Number.parseInt(first(raw.n), 10);
  return {
    q: first(raw.q).trim().slice(0, 80),
    group: MUSCLE_GROUPS.some((g) => g.key === group) ? group : null,
    equipment: [...new Set(first(raw.eq).split(","))].filter((e) => e in EQUIPMENT_LABEL),
    tracking: (TRACKINGS as readonly string[]).includes(tracking) ? (tracking as Tracking) : null,
    shown: Number.isFinite(shown) ? Math.min(MAX_SHOWN, Math.max(BROWSE_PAGE, shown)) : BROWSE_PAGE,
  };
}

/**
 * The URL for these filters with some changed. Changing a filter starts the
 * list from the top again; only "show more" passes `shown`.
 */
export function browseHref(params: BrowseParams, patch: Partial<BrowseParams> = {}): string {
  const next = { ...params, shown: BROWSE_PAGE, ...patch };
  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  if (next.group) search.set("group", next.group);
  if (next.equipment.length) search.set("eq", next.equipment.join(","));
  if (next.tracking) search.set("as", next.tracking);
  if (next.shown > BROWSE_PAGE) search.set("n", String(next.shown));
  const query = search.toString();
  return query ? `/exercises?${query}` : "/exercises";
}

export type BrowseResult<T> = {
  /** The rows to draw: the first `shown` matches. */
  rows: T[];
  /** Matches before paging. */
  total: number;
  /** Equipment that something matching the other filters uses. */
  equipmentOptions: string[];
  /** The equipment filter as applied: chips that would empty the list drop out. */
  activeEquipment: string[];
  /**
   * Where the long tail starts among `rows`, so the page can mark the break
   * between featured-and-yours and the rest. Null while searching (search
   * orders by relevance) or when there is no break on screen.
   */
  tailStart: number | null;
};

function inGroup(exercise: LibraryExercise, group: string | null, tracking: Tracking | null) {
  if (!group) return true;
  // A treadmill works the legs, but nobody looking for leg work means it —
  // unless they asked for cardio.
  if (exercise.tracking === "cardio" && tracking !== "cardio") return false;
  return MUSCLE_GROUPS.find((g) => g.key === group)?.muscles.some((m) => m === exercise.primary_muscle) ?? false;
}

/**
 * Featured movements and your own first, then the rest of the library, each
 * alphabetically. A search orders by how well each row matches instead.
 */
export function browseLibrary<T extends LibraryExercise>(
  library: readonly T[],
  params: BrowseParams,
): BrowseResult<T> {
  const filtered = library.filter(
    (e) =>
      !e.archived_at &&
      inGroup(e, params.group, params.tracking) &&
      (!params.tracking || (e.tracking ?? "reps") === params.tracking),
  );
  const ordered = params.q
    ? searchLibrary(params.q, filtered)
    : [...filtered].sort(
        (a, b) => Number(isPreferred(b)) - Number(isPreferred(a)) || a.name.localeCompare(b.name),
      );

  const equipmentOptions = sortEquipment(ordered.map((e) => e.equipment));
  const activeEquipment = params.equipment.filter((e) => equipmentOptions.includes(e));
  const matches = activeEquipment.length
    ? ordered.filter((e) => activeEquipment.includes(e.equipment))
    : ordered;

  const rows = matches.slice(0, params.shown);
  const tail = params.q ? -1 : rows.findIndex((e) => !isPreferred(e));
  return {
    rows,
    total: matches.length,
    equipmentOptions,
    activeEquipment,
    tailStart: tail > 0 ? tail : null,
  };
}
