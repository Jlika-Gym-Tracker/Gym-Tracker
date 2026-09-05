import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, DAY_NAMES, toDateString } from "@/lib/dates";
import { getWeek } from "@/lib/program/queries";

export type WeekStripDay = {
  dayIndex: number;
  label: string;
  name: string;
  meta: string;
  state: "today" | "done" | "rest" | "plan" | "missed";
  dayId: string | null;
};

export type TodayOverview = {
  weekStart: string;
  weekLabel: string | null;
  weekStatus: string | null;
  todayIndex: number;
  today: {
    dayId: string;
    name: string;
    focusNote: string | null;
    exerciseCount: number;
    setCount: number;
    muscles: string[];
  } | null;
  activeSessionId: string | null;
  strip: WeekStripDay[];
  sessionsThisWeek: number;
  plannedThisWeek: number;
  volumeThisWeekKg: number;
  volumeLastWeekKg: number;
};

/** 0 = Monday, matching program_days.day_index. */
export function mondayIndex(date = new Date()) {
  return (date.getDay() + 6) % 7;
}

export async function getTodayOverview(today = new Date()): Promise<TodayOverview> {
  const supabase = await createClient();
  const weekStart = currentWeekStart(today);
  const todayIndex = mondayIndex(today);
  const lastWeekStart = toDateString(addDays(parseISO(weekStart), -7));

  const [week, { data: sessions }, { data: active }] = await Promise.all([
    getWeek(weekStart),
    supabase
      .from("workout_sessions")
      .select("id, day_id, started_at, ended_at, set_logs ( weight_kg, reps, is_complete )")
      .gte("started_at", lastWeekStart)
      .order("started_at", { ascending: false }),
    supabase
      .from("workout_sessions")
      .select("id")
      .is("ended_at", null)
      .maybeSingle(),
  ]);

  type SessionRow = {
    id: string;
    day_id: string | null;
    started_at: string;
    ended_at: string | null;
    set_logs: { weight_kg: number | null; reps: number | null; is_complete: boolean }[];
  };
  const rows = (sessions ?? []) as unknown as SessionRow[];

  const volumeOf = (r: SessionRow) =>
    r.set_logs
      .filter((s) => s.is_complete)
      .reduce((sum, s) => sum + Number(s.weight_kg ?? 0) * (s.reps ?? 0), 0);

  const inWeek = (r: SessionRow, start: string) => {
    const date = format(parseISO(r.started_at), "yyyy-MM-dd");
    return date >= start && date < toDateString(addDays(parseISO(start), 7));
  };

  const thisWeek = rows.filter((r) => inWeek(r, weekStart) && r.ended_at);
  const lastWeek = rows.filter((r) => inWeek(r, lastWeekStart) && r.ended_at);

  // Which day indexes already have a finished session.
  const doneIndexes = new Set<number>();
  for (const r of thisWeek) {
    doneIndexes.add(mondayIndex(parseISO(r.started_at)));
  }

  const strip: WeekStripDay[] = Array.from({ length: 7 }, (_, i) => {
    const day = week?.days.find((d) => d.day_index === i);
    const sets = day?.exercises.reduce((n, e) => n + e.target_sets, 0) ?? 0;
    const done = doneIndexes.has(i);

    const state: WeekStripDay["state"] = done
      ? "done"
      : i === todayIndex
        ? "today"
        : !day || day.is_rest || day.exercises.length === 0
          ? "rest"
          : i < todayIndex
            ? "missed"
            : "plan";

    return {
      dayIndex: i,
      label: DAY_NAMES[i]!.toUpperCase(),
      name: day?.name ?? "Rest",
      meta: done
        ? "DONE"
        : state === "rest"
          ? "REST"
          : state === "missed"
            ? "MISSED"
            : `${sets} SETS`,
      state,
      dayId: day?.id ?? null,
    };
  });

  const todayDay = week?.days.find((d) => d.day_index === todayIndex);

  return {
    weekStart,
    weekLabel: week?.label ?? null,
    weekStatus: week?.status ?? null,
    todayIndex,
    today:
      todayDay && !todayDay.is_rest && todayDay.exercises.length > 0
        ? {
            dayId: todayDay.id,
            name: todayDay.name,
            focusNote: todayDay.focus_note,
            exerciseCount: todayDay.exercises.length,
            setCount: todayDay.exercises.reduce((n, e) => n + e.target_sets, 0),
            muscles: [
              ...new Set(todayDay.exercises.map((e) => e.exercise.primary_muscle)),
            ].slice(0, 4),
          }
        : null,
    activeSessionId: active?.id ?? null,
    strip,
    sessionsThisWeek: thisWeek.length,
    plannedThisWeek:
      week?.days.filter((d) => !d.is_rest && d.exercises.length > 0).length ?? 0,
    volumeThisWeekKg: thisWeek.reduce((sum, r) => sum + volumeOf(r), 0),
    volumeLastWeekKg: lastWeek.reduce((sum, r) => sum + volumeOf(r), 0),
  };
}
