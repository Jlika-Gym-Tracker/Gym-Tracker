import { format, parseISO, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getMetrics, getPhotos, getStrengthSeries } from "@/lib/body/queries";
import { indexToStart, rollingAverage } from "@/lib/body/stats";
import { estimateOneRepMax } from "@/lib/training/e1rm";
import { WEEK_STARTS_ON, toDateString } from "@/lib/dates";
import type { Pose, UnitSystem } from "@/lib/database.types";
import { ProgressScreen } from "@/components/body/progress-screen";

const POSES: Pose[] = ["front", "side", "back"];

export default async function ProgressPage() {
  const supabase = await createClient();

  const [{ data: profile }, metrics, strengthRows, ...photoLists] = await Promise.all([
    supabase.from("profiles").select("unit_system").maybeSingle(),
    getMetrics(),
    getStrengthSeries(12),
    ...POSES.map((pose) => getPhotos(pose)),
  ]);

  const system = (profile?.unit_system ?? "metric") as UnitSystem;
  const photosByPose = Object.fromEntries(
    POSES.map((pose, i) => [pose, photoLists[i] ?? []]),
  ) as Record<Pose, (typeof photoLists)[number]>;

  // Week-by-week: mean estimated 1RM of the three heaviest movements, against
  // bodyweight, both indexed to 100 so they share one axis.
  const byWeek = new Map<string, { e1rms: Map<string, number> }>();
  for (const row of strengthRows) {
    if (!row.weightKg || !row.reps) continue;
    const week = toDateString(
      startOfWeek(parseISO(row.date), { weekStartsOn: WEEK_STARTS_ON }),
    );
    const entry = byWeek.get(week) ?? { e1rms: new Map<string, number>() };
    const value = estimateOneRepMax(row.weightKg, row.reps);
    entry.e1rms.set(row.exerciseId, Math.max(entry.e1rms.get(row.exerciseId) ?? 0, value));
    byWeek.set(week, entry);
  }

  const weeks = [...byWeek.keys()].sort();
  const strengthRaw = weeks.map((week) => {
    const top3 = [...byWeek.get(week)!.e1rms.values()].sort((a, b) => b - a).slice(0, 3);
    return top3.length ? top3.reduce((a, b) => a + b, 0) / top3.length : 0;
  });
  const bodyweightRaw = weeks.map(
    (week) => rollingAverage(metrics, "weight_kg", 7, week) ?? 0,
  );

  const strengthIdx = indexToStart(strengthRaw);
  const bodyweightIdx = indexToStart(bodyweightRaw);

  const strengthSeries = weeks.map((week, i) => ({
    label: format(parseISO(week), "MMM dd"),
    strength: strengthRaw[i] ? Number(strengthIdx[i]!.toFixed(1)) : null,
    bodyweight: bodyweightRaw[i] ? Number(bodyweightIdx[i]!.toFixed(1)) : null,
  }));

  const strengthDeltaPct =
    strengthIdx.length >= 2 && strengthRaw[strengthRaw.length - 1]
      ? strengthIdx[strengthIdx.length - 1]! - 100
      : null;

  return (
    <ProgressScreen
      metrics={metrics}
      photosByPose={photosByPose}
      system={system}
      strengthSeries={strengthSeries}
      strengthDeltaPct={strengthDeltaPct}
    />
  );
}
