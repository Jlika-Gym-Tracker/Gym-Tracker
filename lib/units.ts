import type { UnitSystem } from "@/lib/database.types";

/**
 * Everything is stored in kg and cm. Conversion happens here, at the display
 * edge, and nowhere else — a converted value must never reach the database.
 */

const LB_PER_KG = 2.2046226218;
const IN_PER_CM = 0.393700787;

export function kgToDisplay(kg: number, system: UnitSystem): number {
  return system === "imperial" ? kg * LB_PER_KG : kg;
}

export function displayToKg(value: number, system: UnitSystem): number {
  return system === "imperial" ? value / LB_PER_KG : value;
}

export function cmToDisplay(cm: number, system: UnitSystem): number {
  return system === "imperial" ? cm * IN_PER_CM : cm;
}

export function displayToCm(value: number, system: UnitSystem): number {
  return system === "imperial" ? value / IN_PER_CM : value;
}

const M_PER_MI = 1609.344;

/** Metres → km, or miles in imperial. Stored in metres like everything else is in SI. */
export function metresToDisplay(m: number, system: UnitSystem): number {
  return system === "imperial" ? m / M_PER_MI : m / 1000;
}

export function displayToMetres(value: number, system: UnitSystem): number {
  return system === "imperial" ? value * M_PER_MI : value * 1000;
}

export function distanceUnit(system: UnitSystem) {
  return system === "imperial" ? "mi" : "km";
}

export function weightUnit(system: UnitSystem) {
  return system === "imperial" ? "lb" : "kg";
}

export function lengthUnit(system: UnitSystem) {
  return system === "imperial" ? "in" : "cm";
}

/** Trims trailing decimal zeros: 32.50 → "32.5", 32.00 → "32", 880 → "880". */
export function trimNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(decimals);
  // Only touch the fractional part — trimming "880" would give "88".
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

export function formatWeight(kg: number | null, system: UnitSystem, decimals = 1) {
  if (kg == null) return "—";
  return trimNumber(kgToDisplay(Number(kg), system), decimals);
}

export function formatLength(cm: number | null, system: UnitSystem, decimals = 1) {
  if (cm == null) return "—";
  return trimNumber(cmToDisplay(Number(cm), system), decimals);
}

/** Volume reads in thousands: 42,300 kg → "42.3k". */
export function formatVolume(kg: number, system: UnitSystem) {
  const value = kgToDisplay(kg, system);
  if (value >= 1000) return `${trimNumber(value / 1000, 1)}k`;
  return trimNumber(value, 0);
}

/** The load step for the progression hint — 2.5 kg, or 5 lb in imperial. */
export function loadIncrementKg(system: UnitSystem) {
  return system === "imperial" ? 5 / LB_PER_KG : 2.5;
}

/**
 * Rounds a load to something you could put on a bar, in the units you lift in:
 * the nearest 0.25 kg, or the nearest 0.5 lb. Done in display units because a
 * kg value that is a whole number of pounds is not a round number of kg, and
 * rounding it in kg would hand an imperial lifter 137.2 lb.
 */
export function roundLoadKg(kg: number, system: UnitSystem): number {
  if (system === "imperial") return displayToKg(Math.round(kgToDisplay(kg, system) * 2) / 2, system);
  return Math.round(kg * 4) / 4;
}

/** Snaps a load to a multiple of `stepKg`, measured in display units. */
export function snapLoadKg(kg: number, stepKg: number, system: UnitSystem): number {
  const step = kgToDisplay(stepKg, system);
  if (!(step > 0)) return roundLoadKg(kg, system);
  const snapped = Math.round(kgToDisplay(kg, system) / step) * step;
  return roundLoadKg(displayToKg(snapped, system), system);
}

/** A load as you would say it: "62.5 kg", "135 lb". */
export function loadText(kg: number, system: UnitSystem): string {
  return `${trimNumber(kgToDisplay(kg, system), 1)} ${weightUnit(system)}`;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
