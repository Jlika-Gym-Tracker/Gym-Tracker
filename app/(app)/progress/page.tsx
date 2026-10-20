import { format, parseISO, startOfWeek, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getMetrics, getPhotos, getStrengthSeries } from "@/lib/body/queries";
import { indexToStart, rollingAverage, type Goal } from "@/lib/body/stats";
import { estimateOneRepMax } from "@/lib/training/e1rm";
import { getTrainingHistory } from "@/lib/training/activity-queries";
import { buildActivityYear } from "@/lib/training/activity";
import {
  EFFORT_WINDOWS,
  effortDisplayScale,
  summariseEffort,
  windowStart,
  type EffortSummary,
  type EffortWindow,
} from "@/lib/training/effort-stats";
import { LOAD_WINDOWS, muscleLoad, type LoadSet } from "@/lib/training/muscle-load";
import { WEEK_STARTS_ON, currentWeekStart, toDateString, type WeekStartDay } from "@/lib/dates";
import type { BodyFigure, EffortScale, Pose, UnitSystem } from "@/lib/database.types";
import { ProgressScreen } from "@/components/body/progress-screen";
import type { MuscleLoads } from "@/components/stats/muscle-map-card";

const POSES: Pose[] = ["front", "side", "back"];

export default async function ProgressPage() {
  const supabase = await createClient();

  const [{ data: profile }, { data: settings }, history, metrics, strengthRows, ...photoLists] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("unit_system, goal, goal_weight_kg, body_figure")
        .maybeSingle(),
      supabase.from("user_settings").select("week_starts_on, effort_scale").maybeSingle(),
      getTrainingHistory(),
      getMetrics(),
      getStrengthSeries(12),
      ...POSES.map((pose) => getPhotos(pose)),
    ]);

  const system = (profile?.unit_system ?? "metric") as UnitSystem;
  const startsOn = (settings?.week_starts_on ?? WEEK_STARTS_ON) as WeekStartDay;
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

  // ── Training statistics ────────────────────────────────────────────────
  // Every set is dated by the day its session started, the same day the
  // heatmap files the session under.
  const today = new Date();
  const sessionDay = new Map(
    history.sessions.map((s) => [s.id, toDateString(parseISO(s.startedAt))]),
  );
  const sets = history.sets.flatMap((set) => {
    const date = sessionDay.get(set.sessionId);
    return date ? [{ ...set, date }] : [];
  });

  const volumeBySession = new Map<string, number>();
  for (const set of sets) {
    volumeBySession.set(
      set.sessionId,
      (volumeBySession.get(set.sessionId) ?? 0) + (set.weightKg ?? 0) * (set.reps ?? 0),
    );
  }
  const activity = buildActivityYear({
    sessions: history.sessions.map((s) => ({ ...s, volumeKg: volumeBySession.get(s.id) ?? 0 })),
    today,
    weekStartsOn: startsOn,
  });

  const loadSince = {
    week: currentWeekStart(today, startsOn),
    "30d": toDateString(subDays(today, 29)),
    all: null,
  };
  const loads = Object.fromEntries(
    LOAD_WINDOWS.map(({ key }) => {
      const since = loadSince[key];
      const inWindow: LoadSet[] = [];
      for (const set of sets) {
        const exercise = history.exercises.get(set.exerciseId);
        if (!exercise || (since && set.date < since)) continue;
        inWindow.push({
          primaryMuscle: exercise.primaryMuscle,
          secondaryMuscles: exercise.secondaryMuscles,
          rpe: set.rpe,
        });
      }
      return [key, { all: muscleLoad(inWindow), hard: muscleLoad(inWindow, { hardOnly: true }) }];
    }),
  ) as MuscleLoads;

  const rated = sets.some((s) => s.rpe != null);
  const effortScale = effortDisplayScale(
    (settings?.effort_scale ?? "rpe") as EffortScale,
    rated,
  );
  const effort = effortScale
    ? {
        scale: effortScale,
        summaries: Object.fromEntries(
          EFFORT_WINDOWS.map(({ key }) => [
            key,
            summariseEffort(sets, { since: windowStart(key, today), weekStartsOn: startsOn }),
          ]),
        ) as Record<EffortWindow, EffortSummary>,
      }
    : null;

  return (
    <ProgressScreen
      metrics={metrics}
      photosByPose={photosByPose}
      system={system}
      strengthSeries={strengthSeries}
      strengthDeltaPct={strengthDeltaPct}
      goal={(profile?.goal ?? "cut") as Goal}
      goalWeightKg={profile?.goal_weight_kg == null ? null : Number(profile.goal_weight_kg)}
      weekStartsOn={startsOn}
      activity={activity}
      muscles={{
        loads,
        figure: (profile?.body_figure ?? "male") as BodyFigure,
        rated,
      }}
      effort={effort}
    />
  );
}
