import type { LocalDateTime } from "./types";

/**
 * Reading single cells: numbers, durations, dates and units, in the spellings
 * the exporting apps actually use. Each returns null for "nothing here" and
 * undefined for "something here we couldn't read", so the caller can tell a
 * blank cell from a broken one and only complain about the second.
 */

/** "102.5", "102,5" (a semicolon file from a comma-decimal locale), " 80 ". */
export function readNumber(raw: string): number | null | undefined {
  let s = raw.trim();
  if (!s) return null;
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  const value = Number(s);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Seconds from any of: 90 · "1:30" · "0:30:00" · "1h 5m" · "45m" · "30s".
 * A bare number is seconds, which is what Strong's and Hevy's set columns hold.
 */
export function readDuration(raw: string): number | null | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));

  const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?$/.exec(s);
  if (clock) {
    const [a, b, c] = [Number(clock[1]), Number(clock[2]), clock[3] == null ? null : Number(clock[3])];
    return c == null ? a * 60 + b : a * 3600 + b * 60 + c;
  }

  // Strong's workout length: "1h 5m", "38m", "2h".
  const words = /^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?)?)?)?$/.exec(s);
  if (words && (words[1] || words[2] || words[3])) {
    return Number(words[1] ?? 0) * 3600 + Number(words[2] ?? 0) * 60 + Number(words[3] ?? 0);
  }
  return undefined;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function build(
  year: number, month: number, day: number,
  hour: number | null, minute: number | null, meridiem?: string,
): LocalDateTime | null {
  let h = hour ?? 12;
  const m = minute ?? 0;
  if (meridiem) {
    const pm = meridiem.toLowerCase().startsWith("p");
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (year < 1980 || year > 2100 || month < 1 || month > 12 || h > 23 || m > 59) return null;
  // Date.UTC rolls 31 Feb into March; a real date survives the round trip.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCDate() !== day || probe.getUTCMonth() !== month - 1) return null;
  return { date: `${year}-${pad(month)}-${pad(day)}`, time: `${pad(h)}:${pad(m)}` };
}

/**
 * The date formats these exports use, read as wall-clock time:
 *
 *   2020-12-30 18:51:52     Strong
 *   2024-03-07              FitNotes (no time — noon is assumed, see `timeStated`)
 *   12 Jan 2026, 18:00      Hevy
 *   Jan 12, 2026, 6:00 PM   Hevy in a US locale
 *
 * Purely numeric dates like 07/03/2024 are refused on purpose: none of these
 * apps write them, and guessing day-first or month-first would quietly move
 * half a history by months.
 */
export function readDateTime(raw: string): { at: LocalDateTime; timeStated: boolean } | null {
  const s = raw.trim();

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([ap]\.?m\.?)?)?/i.exec(s);
  if (iso) {
    const at = build(+iso[1]!, +iso[2]!, +iso[3]!,
      iso[4] == null ? null : +iso[4], iso[5] == null ? null : +iso[5], iso[6]);
    return at ? { at, timeStated: iso[4] != null } : null;
  }

  const dayFirst = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})(?:,?\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?)?$/i.exec(s);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2]!.toLowerCase()];
    if (!month) return null;
    const at = build(+dayFirst[3]!, month, +dayFirst[1]!,
      dayFirst[4] == null ? null : +dayFirst[4], dayFirst[5] == null ? null : +dayFirst[5], dayFirst[6]);
    return at ? { at, timeStated: dayFirst[4] != null } : null;
  }

  const monthFirst = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?)?$/i.exec(s);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1]!.toLowerCase()];
    if (!month) return null;
    const at = build(+monthFirst[3]!, month, +monthFirst[2]!,
      monthFirst[4] == null ? null : +monthFirst[4], monthFirst[5] == null ? null : +monthFirst[5], monthFirst[6]);
    return at ? { at, timeStated: monthFirst[4] != null } : null;
  }

  return null;
}

/** Minutes between two wall-clock moments, ignoring time zones on purpose. */
export function minutesBetween(a: LocalDateTime, b: LocalDateTime): number {
  const toMinutes = (x: LocalDateTime) => {
    const [y, mo, d] = x.date.split("-").map(Number) as [number, number, number];
    const [h, mi] = x.time.split(":").map(Number) as [number, number];
    return Date.UTC(y, mo - 1, d, h, mi) / 60_000;
  };
  return toMinutes(b) - toMinutes(a);
}

export type WeightUnit = "kg" | "lb";

/** "kgs", "kg", "Kilograms" → kg; "lbs", "lb", "pounds" → lb. */
export function readWeightUnit(raw: string): WeightUnit | null {
  const s = raw.trim().toLowerCase();
  if (/^(kgs?|kilo(gram)?s?)$/.test(s)) return "kg";
  if (/^(lbs?|pounds?)$/.test(s)) return "lb";
  return null;
}

const METRES: Record<string, number> = {
  m: 1, meter: 1, meters: 1, metre: 1, metres: 1,
  km: 1000, kms: 1000, kilometer: 1000, kilometers: 1000, kilometre: 1000, kilometres: 1000,
  mi: 1609.344, mile: 1609.344, miles: 1609.344,
  ft: 0.3048, feet: 0.3048, foot: 0.3048,
  yd: 0.9144, yds: 0.9144, yard: 0.9144, yards: 0.9144,
};

/** How many metres one of `raw` is, or null for a unit we don't know. */
export function metresPer(raw: string): number | null {
  return METRES[raw.trim().toLowerCase()] ?? null;
}
