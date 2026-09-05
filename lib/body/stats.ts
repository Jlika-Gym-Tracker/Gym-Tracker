/**
 * Body-progress maths: rolling averages, deltas and the goal-relative change
 * the crew league scores on. Pure functions, unit-tested.
 */

export type Metric = {
  measured_on: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  hip_cm: number | null;
  bodyfat_pct: number | null;
};

export type MetricField = Exclude<keyof Metric, "measured_on">;

export const MEASURE_FIELDS: { key: MetricField; label: string; unit: "kg" | "cm" | "%" }[] = [
  { key: "weight_kg", label: "Weight", unit: "kg" },
  { key: "waist_cm", label: "Waist", unit: "cm" },
  { key: "chest_cm", label: "Chest", unit: "cm" },
  { key: "arm_cm", label: "Arm", unit: "cm" },
  { key: "thigh_cm", label: "Thigh", unit: "cm" },
  { key: "hip_cm", label: "Hip", unit: "cm" },
  { key: "bodyfat_pct", label: "Body fat", unit: "%" },
];

/** Most recent non-null value for a field, with the date it was recorded. */
export function latest(
  metrics: Metric[],
  field: MetricField,
): { value: number; on: string } | null {
  for (const m of [...metrics].sort((a, b) => b.measured_on.localeCompare(a.measured_on))) {
    const value = m[field];
    if (value != null) return { value: Number(value), on: m.measured_on };
  }
  return null;
}

/** Oldest non-null value — the baseline a delta is measured from. */
export function earliest(
  metrics: Metric[],
  field: MetricField,
): { value: number; on: string } | null {
  for (const m of [...metrics].sort((a, b) => a.measured_on.localeCompare(b.measured_on))) {
    const value = m[field];
    if (value != null) return { value: Number(value), on: m.measured_on };
  }
  return null;
}

export function delta(metrics: Metric[], field: MetricField): number | null {
  const first = earliest(metrics, field);
  const last = latest(metrics, field);
  if (!first || !last || first.on === last.on) return null;
  return last.value - first.value;
}

/**
 * Mean of the values within `days` of the newest reading.
 *
 * Single weigh-ins swing by a kilo on water alone, so anything that judges
 * progress — the league included — reads an average, never one number.
 */
export function rollingAverage(
  metrics: Metric[],
  field: MetricField,
  days = 7,
  asOf?: string,
): number | null {
  const values = metrics
    .filter((m) => m[field] != null)
    .sort((a, b) => b.measured_on.localeCompare(a.measured_on));
  if (values.length === 0) return null;

  const anchor = asOf ?? values[0]!.measured_on;
  const cutoff = new Date(anchor);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const window = values.filter((m) => m.measured_on <= anchor && m.measured_on > cutoffKey);
  const pool = window.length > 0 ? window : [values[0]!];
  return pool.reduce((sum, m) => sum + Number(m[field]), 0) / pool.length;
}

export type Goal = "cut" | "bulk" | "recomp" | "strength" | "health";

/**
 * Percentage of bodyweight moved *toward the stated goal*, so a cut and a bulk
 * can be compared on the same scale.
 *
 * Cut: loss counts. Bulk: gain counts. Recomp: holding within 0.5% counts as a
 * small positive, because not moving is the point.
 */
export function goalProgressPct(
  startWeightKg: number,
  currentWeightKg: number,
  goal: Goal,
): number {
  if (startWeightKg <= 0) return 0;
  const changePct = ((currentWeightKg - startWeightKg) / startWeightKg) * 100;

  switch (goal) {
    case "cut":
      return -changePct;
    case "bulk":
      return changePct;
    case "recomp":
      return Math.abs(changePct) < 0.5 ? 0.5 : -Math.abs(changePct);
    default:
      // Strength and health are not weight-driven; weight change is neutral.
      return 0;
  }
}

/** Index a series to 100 at its first point, for the strength-vs-bodyweight chart. */
export function indexToStart(values: number[]): number[] {
  const base = values.find((v) => v > 0);
  if (!base) return values.map(() => 100);
  return values.map((v) => (v / base) * 100);
}
