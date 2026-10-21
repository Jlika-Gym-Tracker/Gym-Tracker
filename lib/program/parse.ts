/**
 * Turns a pasted training week into structured days and exercises.
 *
 * The input is whatever someone types or copies out of a PDF, so the parser is
 * deliberately forgiving about separators and casing, and deliberately strict
 * about what counts as a day header — mistaking a page footer for a day would
 * silently split the week in two.
 *
 * Pure functions only: no database, no fuzzy matching. Matching against the
 * exercise library happens in ./match.ts so each half can be tested alone.
 */

/** How a pasted line reads: sets of reps, a held time, or a cardio block. */
export type ParsedKind = "reps" | "time" | "cardio";

export type ParsedExercise = {
  /** 1-based line number in the original paste, for the review step. */
  line: number;
  raw: string;
  name: string;
  kind: ParsedKind;
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  /** Hold time per set for "time", session length for "cardio", in seconds. */
  targetSeconds: number | null;
  perSide: boolean;
  note: string | null;
};

export type ParseOptions = {
  /**
   * The weekday the week being filled starts on (0 = Sunday … 6 = Saturday),
   * so a "Thursday" header lands on the right day of a week that begins on a
   * Saturday. Monday when omitted.
   */
  weekStartsOn?: number;
};

export type ParsedDay = {
  line: number;
  /** 0 = Monday. Assigned from the day's order, or from an explicit "DAY n". */
  dayIndex: number;
  name: string;
  focusNote: string | null;
  isRest: boolean;
  exercises: ParsedExercise[];
};

export type ParseIssue = {
  line: number;
  raw: string;
  reason: "no_day_header" | "unreadable";
};

export type ParseResult = {
  days: ParsedDay[];
  /** Lines that looked like content but could not be read. */
  issues: ParseIssue[];
  /** Every line that carried meaning, for the "Parse N lines" button. */
  parsedLineCount: number;
};

const DAY_HEADER = /^day\s*(\d+)\s*(?:[-–—:·.)]|\s)\s*(.*)$/i;

/**
 * Bare day names like "UPPER A" or "PUSH". Anchored to a known vocabulary so
 * that stray short lines — PDF page footers, dates, "FOCUS" — are not swallowed.
 */
const BARE_DAY =
  /^(upper|lower|push|pull|legs?|full\s*body|arms?|chest|back|shoulders?|rest|off)\b[a-z0-9\s&/+-]*$/i;

/**
 * "Monday - Upper A", "TUE: Lower A", "Thursday — Upper B", "Friday". Checked
 * only on lines with no set spec, so an exercise named after a weekday (there
 * are none) could not be mistaken for one.
 */
const WEEKDAY_HEADER =
  /^(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)\b\.?\s*(?:[-–—:·|,/)]\s*)?(.*)$/i;
const WEEKDAY_NUMBER: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};
const WEEKDAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FOCUS_LINE = /^(?:focus|notes?)\b\s*[:.-]?\s*(.*)$/i;
const REST_DAY = /\b(rest|off)\b/i;

/** "each leg", "per side", "/arm", a bare "each" — all mean the sets are per limb. */
const PER_SIDE =
  /\s*(?:\(|\/|\b)(?:each|per)(?:\s*(?:side|leg|arm|hand)s?)?\)?\s*$|\s*\/\s*(?:side|leg|arm)s?\s*$/i;

const RANGE = String.raw`(\d{1,3})\s*(?:[-–—]|to)\s*(\d{1,3})`;
const CROSS = String.raw`(?:x|×|\*)`;

/** "3 x 8-12", "4 × 12-15", "3x8" — sets first, reps second. */
const SETS_REP_RANGE = new RegExp(String.raw`(\d{1,2})\s*${CROSS}\s*${RANGE}\s*(?:reps?)?$`, "i");
const SETS_REPS = new RegExp(String.raw`(\d{1,2})\s*${CROSS}\s*(\d{1,3})\s*(?:reps?)?$`, "i");
/** "3 sets", "3 sets of 10", "3 sets of 8-12". */
const SETS_ONLY = new RegExp(
  String.raw`(\d{1,2})\s*sets?(?:\s*(?:of|x|×)\s*(?:${RANGE}|(\d{1,3})))?\s*(?:reps?)?$`,
  "i",
);

const SECONDS_UNIT = String.raw`(?:s|sec|secs|second|seconds)`;
const MINUTES_UNIT = String.raw`(?:m|min|mins|minute|minutes)`;

/** "3 × 30–60 sec", "3 x 45s", "2 sets of 1 min" — sets of a held time. */
const SETS_TIME = new RegExp(
  String.raw`(\d{1,2})\s*(?:sets?\s*(?:of|x|×)?|${CROSS})\s*(\d{1,4})(?:\s*(?:[-–—]|to)\s*(\d{1,4}))?\s*(${SECONDS_UNIT}|${MINUTES_UNIT})\b\.?(?:\s*holds?)?$`,
  "i",
);

/** "15 min", "10–15 minutes", "45 sec" — one block of time. */
const DURATION = new RegExp(
  String.raw`(\d{1,3})(?:\s*(?:[-–—]|to)\s*(\d{1,3}))?\s*(${MINUTES_UNIT}|${SECONDS_UNIT})\b\.?`,
  "i",
);

/** "Cardio: 15 min incline treadmill walk", "Conditioning — 10 min bike". */
const CARDIO_PREFIX = /^(?:cardio|conditioning|finisher)\s*[:\-–—]\s*(.*)$/i;

/** Names that are plainly cardio, for "Treadmill: 20 min" with no prefix. */
const CARDIO_WORDS =
  /\b(run|running|jog|jogging|treadmill|bike|biking|cycling|cycle|spin|elliptical|cross ?trainer|stair|stairs|stairmaster|stepper|walk|walking|row(?:er|ing)? machine|rower|erg|swim|swimming|jump rope|skipping|hike)\b/i;

const LEADING_INDEX = /^(\d{1,2})\s*[.)\]]?\s+/;
const TRAILING_NOTE = /\s*[([]([^)\]]{1,80})[)\]]\s*$/;

/** Gym shorthand that must not be lower-cased when re-casing an ALL-CAPS line. */
const ACRONYMS = new Set(["ez", "db", "bb", "kb", "rdl", "ohp", "rpe", "ghr", "t"]);

function titleCase(input: string) {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[^a-z0-9]/g, "");
      if (ACRONYMS.has(bare)) return w.toUpperCase();
      return w.replace(/^[a-z]/, (c) => c.toUpperCase());
    })
    .join(" ");
}

/**
 * Names come through as typed. Only an ALL-CAPS line gets re-cased — that is a
 * PDF or a shouty paste, not a deliberate choice, and "INCLINE DUMBBELL PRESS"
 * should not end up shouting in the program builder.
 */
function tidyName(input: string) {
  const collapsed = input.replace(/\s+/g, " ").trim();
  const letters = collapsed.replace(/[^a-zA-Z]/g, "");
  const isAllCaps = letters.length > 1 && letters === letters.toUpperCase();
  return isAllCaps ? titleCase(collapsed) : collapsed;
}

type SetSpec = {
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  /** Where in the string the spec started, so the name can be cut there. */
  index: number;
};

function readSetSpec(text: string): SetSpec | null {
  let m = SETS_REP_RANGE.exec(text);
  if (m) {
    return {
      targetSets: Number(m[1]),
      repMin: Number(m[2]),
      repMax: Number(m[3]),
      index: m.index,
    };
  }
  m = SETS_REPS.exec(text);
  if (m) {
    const reps = Number(m[2]);
    return { targetSets: Number(m[1]), repMin: reps, repMax: reps, index: m.index };
  }
  m = SETS_ONLY.exec(text);
  if (m) {
    // "3 sets of 8-12" fills groups 2/3; "3 sets of 10" fills group 4.
    const min = m[2] ? Number(m[2]) : m[4] ? Number(m[4]) : null;
    const max = m[3] ? Number(m[3]) : m[4] ? Number(m[4]) : null;
    return { targetSets: Number(m[1]), repMin: min, repMax: max, index: m.index };
  }
  return null;
}

function toSeconds(value: number, unit: string) {
  return /^m/i.test(unit) ? value * 60 : value;
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A cardio block: "Cardio: 15 min incline treadmill walk", or a line that is
 * just a cardio machine and a duration, "Treadmill: 20 min". The descriptor
 * becomes the name to match and is kept as the note, because "incline" or
 * "easy" is the instruction the library row will not carry.
 */
function parseCardioLine(text: string, line: number, raw: string): ParsedExercise | null {
  const prefixed = CARDIO_PREFIX.exec(text);
  const body = prefixed ? prefixed[1]!.trim() : text;
  const duration = DURATION.exec(body);
  if (!prefixed && (!duration || !CARDIO_WORDS.test(body))) return null;

  const seconds = duration ? toSeconds(Number(duration[1]), duration[3]!) : null;
  const described = (duration ? body.slice(0, duration.index) + " " + body.slice(duration.index + duration[0].length) : body)
    .replace(/^[\s:\-–—,]+|[\s:\-–—,]+$/g, "")
    .replace(/^(?:of|on( the)?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const name = described ? capitalise(tidyName(described)) : "Cardio";

  return {
    line,
    raw: raw.trim(),
    name,
    kind: "cardio",
    targetSets: 1,
    repMin: null,
    repMax: null,
    targetSeconds: seconds,
    perSide: false,
    note: described ? `${capitalise(described)}${duration ? `, ${duration[0].trim()}` : ""}` : null,
  };
}

function parseExerciseLine(raw: string, line: number): ParsedExercise | null {
  let text = raw.trim().replace(LEADING_INDEX, "");

  let note: string | null = null;
  const noteMatch = TRAILING_NOTE.exec(text);
  // Only treat a trailing parenthetical as a note when it is not the per-side
  // marker and not the rep spec itself.
  if (noteMatch && !PER_SIDE.test(noteMatch[0]) && !readSetSpec(noteMatch[1]!)) {
    note = noteMatch[1]!.trim();
    text = text.slice(0, noteMatch.index).trim();
  }

  let perSide = false;
  if (PER_SIDE.test(text)) {
    perSide = true;
    text = text.replace(PER_SIDE, "").trim();
  }

  // A held time: the bottom of a range is where the add-time rule starts.
  const timed = SETS_TIME.exec(text);
  if (timed) {
    const name = text.slice(0, timed.index).replace(/[-–—:,]+\s*$/, "").trim();
    if (name) {
      const unit = timed[4]!;
      const low = toSeconds(Number(timed[2]), unit);
      const high = timed[3] ? toSeconds(Number(timed[3]), unit) : null;
      return {
        line,
        raw: raw.trim(),
        name: tidyName(name),
        kind: "time",
        targetSets: Number(timed[1]),
        repMin: null,
        repMax: null,
        targetSeconds: low,
        perSide,
        note: note ?? (high ? `Build from ${low}s to ${high}s` : null),
      };
    }
  }

  const spec = readSetSpec(text);
  if (!spec) return parseCardioLine(text, line, raw);

  const name = text.slice(0, spec.index).replace(/[-–—:,]+\s*$/, "").trim();
  if (!name) return null;

  return {
    line,
    raw: raw.trim(),
    name: tidyName(name),
    kind: "reps",
    targetSets: spec.targetSets,
    repMin: spec.repMin,
    repMax: spec.repMax,
    targetSeconds: null,
    perSide,
    note,
  };
}

export function parseProgramText(input: string, { weekStartsOn = 1 }: ParseOptions = {}): ParseResult {
  const lines = input.split(/\r?\n/);
  const days: ParsedDay[] = [];
  const issues: ParseIssue[] = [];
  let parsedLineCount = 0;
  let awaitingFocusFor: ParsedDay | null = null;

  const startDay = (line: number, explicitIndex: number | null, name: string) => {
    const day: ParsedDay = {
      line,
      dayIndex: explicitIndex ?? days.length,
      name: name.trim() || `Day ${days.length + 1}`,
      focusNote: null,
      isRest: REST_DAY.test(name),
      exercises: [],
    };
    days.push(day);
    return day;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const text = raw.trim();
    const lineNo = i + 1;

    if (!text) {
      awaitingFocusFor = null;
      continue;
    }

    // A focus/notes block attaches prose to the day that precedes it.
    const focus = FOCUS_LINE.exec(text);
    if (focus && days.length > 0) {
      parsedLineCount++;
      const inline = focus[1]!.trim();
      const current = days[days.length - 1]!;
      if (inline) {
        current.focusNote = inline;
      } else {
        awaitingFocusFor = current;
      }
      continue;
    }

    if (awaitingFocusFor) {
      // The line straight after a bare "FOCUS" is that day's note — unless it
      // is plainly the next day or another exercise.
      const isStructural =
        DAY_HEADER.test(text) || WEEKDAY_HEADER.test(text) || readSetSpec(text) !== null;
      if (!isStructural) {
        awaitingFocusFor.focusNote = text;
        awaitingFocusFor = null;
        parsedLineCount++;
        continue;
      }
      awaitingFocusFor = null;
    }

    // "Monday - Upper A": the day goes where Monday falls in this week.
    const weekday = WEEKDAY_HEADER.exec(text);
    if (weekday && readSetSpec(text) === null && !SETS_TIME.test(text)) {
      parsedLineCount++;
      const number = WEEKDAY_NUMBER[weekday[1]!.toLowerCase().slice(0, 3)]!;
      const index = (number - weekStartsOn + 7) % 7;
      startDay(lineNo, index, weekday[2]!.trim() || WEEKDAY_NAME[number]!);
      continue;
    }

    const header = DAY_HEADER.exec(text);
    if (header) {
      parsedLineCount++;
      const explicit = Number(header[1]) - 1;
      startDay(lineNo, Number.isFinite(explicit) && explicit >= 0 ? explicit : null, header[2]!);
      continue;
    }

    const exercise = parseExerciseLine(text, lineNo);
    if (exercise) {
      if (days.length === 0) {
        // Exercises before any header still belong somewhere.
        startDay(lineNo, null, "Day 1");
      }
      parsedLineCount++;
      days[days.length - 1]!.exercises.push(exercise);
      continue;
    }

    if (BARE_DAY.test(text) && text.length <= 32) {
      parsedLineCount++;
      startDay(lineNo, null, text);
      continue;
    }

    issues.push({
      line: lineNo,
      raw: text,
      reason: days.length === 0 ? "no_day_header" : "unreadable",
    });
  }

  // A day whose header said "rest" but that carries exercises is not a rest day.
  for (const day of days) if (day.exercises.length > 0) day.isRest = false;

  // Two headers for one weekday (or "Day 2" after "Tuesday") would collide on
  // the same slot; the later one moves to the next free day rather than
  // failing the whole import.
  const taken = new Set<number>();
  for (const day of days) {
    let index = day.dayIndex;
    for (let step = 0; step < 7 && taken.has(index); step++) index = (index + 1) % 7;
    day.dayIndex = index;
    taken.add(index);
  }

  return { days, issues, parsedLineCount };
}
