import { currentWeekStart } from "@/lib/dates";
import { findPreviousWeek, getLibrary, getWeek } from "@/lib/program/queries";
import { weeklyLoad } from "@/lib/program/volume";
import { ProgramBuilder } from "@/components/program/program-builder";
import { NewWeekPrompt } from "@/components/program/new-week-prompt";

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: requested } = await searchParams;
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(requested ?? "")
    ? requested!
    : currentWeekStart();

  const [week, library, previous] = await Promise.all([
    getWeek(weekStart),
    getLibrary(),
    findPreviousWeek(weekStart),
  ]);

  if (!week) {
    return <NewWeekPrompt weekStart={weekStart} hasEarlierWeek={Boolean(previous)} />;
  }

  return (
    <ProgramBuilder
      week={week}
      library={library}
      load={weeklyLoad(week.days)}
      hasEarlierWeek={Boolean(previous)}
    />
  );
}
