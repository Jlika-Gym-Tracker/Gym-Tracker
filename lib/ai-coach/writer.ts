import "server-only";
import type { Json } from "@/lib/database.types";
import { getSessionDayIds, getWeekSnapshot, type Supabase } from "./queries";
import type { WeekSnapshot } from "./schemas";
import { EMPTY_REST_DAY, planWeekWrite } from "./week";

/**
 * Writes a target week over whatever is in that slot now, after storing what
 * was there. The snapshot is written first: if any later step fails, Revert
 * still has the original to put back.
 *
 * Only program_weeks, program_days and program_exercises are written.
 * workout_sessions and set_logs are not read for anything but "was a session
 * logged against this day", and never written.
 *
 * Supabase's client has no transactions, so the steps run in the order that
 * leaves the least damage if one fails: week row, clear exercises, days in
 * place, then exercises back in.
 */
export async function snapshotAndWrite({
  supabase,
  userId,
  weekStart,
  target,
  proposalId,
}: {
  supabase: Supabase;
  userId: string;
  weekStart: string;
  target: WeekSnapshot;
  proposalId: string | null;
}): Promise<{ snapshotId: string }> {
  const current = await getWeekSnapshot(supabase, userId, weekStart);

  const { data: snapshot, error } = await supabase
    .from("ai_coach_snapshots")
    .insert({
      user_id: userId,
      proposal_id: proposalId,
      week_start: weekStart,
      snapshot: current as unknown as Json,
    })
    .select("id")
    .single();
  if (error) throw error;

  await writeWeek({ supabase, userId, weekStart, current, target });
  return { snapshotId: snapshot.id };
}

export async function writeWeek({
  supabase,
  userId,
  weekStart,
  current,
  target,
}: {
  supabase: Supabase;
  userId: string;
  weekStart: string;
  current: WeekSnapshot;
  target: WeekSnapshot;
}) {
  const dayIds = current.days.flatMap((d) => (d.id ? [d.id] : []));
  const logged = await getSessionDayIds(supabase, userId, dayIds);
  const ops = planWeekWrite(current, target, logged);

  let weekId = current.week?.id ?? null;
  switch (ops.week.action) {
    case "create": {
      const { data, error } = await supabase
        .from("program_weeks")
        .insert({ user_id: userId, week_start: weekStart, ...ops.week.fields })
        .select("id")
        .single();
      if (error) throw error;
      weekId = data.id;
      break;
    }
    case "update": {
      const { error } = await supabase
        .from("program_weeks")
        .update(ops.week.fields)
        .eq("id", ops.week.id)
        .eq("user_id", userId);
      if (error) throw error;
      break;
    }
    case "delete": {
      const { error } = await supabase
        .from("program_weeks")
        .delete()
        .eq("id", ops.week.id)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    case "none":
      return;
  }
  if (!weekId) throw new Error("That week could not be written.");

  if (ops.deleteExerciseIds.length) {
    const { error } = await supabase.from("program_exercises").delete().in("id", ops.deleteExerciseIds);
    if (error) throw error;
  }

  for (const day of ops.updateDays) {
    const { error } = await supabase
      .from("program_days")
      .update(day.fields)
      .eq("id", day.id)
      .eq("week_id", weekId);
    if (error) throw error;
  }

  if (ops.insertDays.length) {
    const { error } = await supabase
      .from("program_days")
      .insert(ops.insertDays.map((day) => ({ ...day, week_id: weekId! })));
    if (error) throw error;
  }

  if (ops.restDayIds.length) {
    const { error } = await supabase
      .from("program_days")
      .update(EMPTY_REST_DAY)
      .in("id", ops.restDayIds)
      .eq("week_id", weekId);
    if (error) throw error;
  }

  if (ops.deleteDayIds.length) {
    const { error } = await supabase
      .from("program_days")
      .delete()
      .in("id", ops.deleteDayIds)
      .eq("week_id", weekId);
    if (error) throw error;
  }

  if (ops.insertExercises.length === 0) return;

  const { data: days, error: daysError } = await supabase
    .from("program_days")
    .select("id, day_index")
    .eq("week_id", weekId);
  if (daysError) throw daysError;
  const dayIdByIndex = new Map((days ?? []).map((d) => [d.day_index, d.id]));

  const rows = ops.insertExercises.flatMap(({ day_index, row }) => {
    const dayId = dayIdByIndex.get(day_index);
    if (!dayId) return [];
    const { id, ...fields } = row;
    return [{ ...(id ? { id } : {}), ...fields, day_id: dayId }];
  });

  const { error } = await supabase.from("program_exercises").insert(rows);
  // A snapshot's ids go back in so Revert restores the same rows. Should one
  // be taken already (it cannot be, short of a hand edit), keep the content.
  if (error?.code === "23505") {
    const { error: retry } = await supabase
      .from("program_exercises")
      .insert(rows.map((row) => ({ ...row, id: undefined })));
    if (retry) throw retry;
  } else if (error) {
    throw error;
  }
}
