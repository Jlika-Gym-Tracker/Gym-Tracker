import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, toDateString } from "@/lib/dates";
import type { BodyFigure, UnitSystem } from "@/lib/database.types";
import { muscleLoad } from "@/lib/training/muscle-load";
import { MusclePreview } from "@/components/stats/muscle-preview";
import { getWeekStartsOn } from "@/lib/settings/week";
import { findPreviousWeek, getLibrary, getWeek, getWeekContaining } from "@/lib/program/queries";
import { weeklyLoad } from "@/lib/program/volume";
import { ProgramBuilder } from "@/components/program/program-builder";
import { NewWeekPrompt } from "@/components/program/new-week-prompt";

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: requested } = await searchParams;
  const explicit = /^\d{4}-\d{2}-\d{2}$/.test(requested ?? "") ? requested! : null;
  const startsOn = await getWeekStartsOn();
  const weekStart = explicit ?? currentWeekStart(new Date(), startsOn);

  const supabase = await createClient();
  const [exact, library, previous, { data: profile }] = await Promise.all([
    getWeek(weekStart),
    getLibrary(),
    findPreviousWeek(weekStart),
    supabase.from("profiles").select("unit_system, body_figure").maybeSingle(),
  ]);

  // Weeks written before the start day was changed begin on a different
  // weekday, so fall back to whichever week actually contains today.
  const week = exact ?? (explicit ? null : await getWeekContaining(toDateString(new Date())));

  if (!week) {
    return <NewWeekPrompt weekStart={weekStart} hasEarlierWeek={Boolean(previous)} />;
  }

  // What each day works, drawn on the server: one entry per planned set, so a
  // 5-set squat weighs more than a 2-set curl. Cardio is not working sets.
  const figure = (profile?.body_figure ?? "male") as BodyFigure;
  const dayPreviews = Object.fromEntries(
    week.days.map((day) => [
      day.id,
      <MusclePreview
        key={day.id}
        title={`What ${day.name} hits`}
        figure={figure}
        empty="Add an exercise and the muscles it works light up here."
        load={muscleLoad(
          day.exercises
            .filter((item) => item.exercise.tracking !== "cardio")
            .flatMap((item) =>
              Array.from({ length: item.target_sets }, () => ({
                primaryMuscle: item.exercise.primary_muscle,
                secondaryMuscles: item.exercise.secondary_muscles,
              })),
            ),
        )}
      />,
    ]),
  );

  return (
    <ProgramBuilder
      dayPreviews={dayPreviews}
      week={week}
      library={library}
      load={weeklyLoad(week.days)}
      hasEarlierWeek={Boolean(previous)}
      system={(profile?.unit_system ?? "metric") as UnitSystem}
    />
  );
}
