import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, toDateString } from "@/lib/dates";
import type { UnitSystem } from "@/lib/database.types";
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
    supabase.from("profiles").select("unit_system").maybeSingle(),
  ]);

  // Weeks written before the start day was changed begin on a different
  // weekday, so fall back to whichever week actually contains today.
  const week = exact ?? (explicit ? null : await getWeekContaining(toDateString(new Date())));

  if (!week) {
    return <NewWeekPrompt weekStart={weekStart} hasEarlierWeek={Boolean(previous)} />;
  }

  return (
    <ProgramBuilder
      week={week}
      library={library}
      load={weeklyLoad(week.days)}
      hasEarlierWeek={Boolean(previous)}
      system={(profile?.unit_system ?? "metric") as UnitSystem}
    />
  );
}
