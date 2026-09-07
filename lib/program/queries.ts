import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Exercise, ProgramWeek, WeekStatus } from "@/lib/database.types";
import type { LibraryExercise } from "./match";

export type DayWithExercises = {
  id: string;
  day_index: number;
  name: string;
  focus_note: string | null;
  is_rest: boolean;
  exercises: {
    id: string;
    position: number;
    target_sets: number;
    rep_min: number | null;
    rep_max: number | null;
    per_side: boolean;
    note: string | null;
    target_weight_kg: number | null;
    exercise: Pick<
      Exercise,
      "id" | "name" | "slug" | "primary_muscle" | "equipment" | "image_start_url"
    >;
  }[];
};

export type WeekDetail = ProgramWeek & { days: DayWithExercises[] };

/** The week being edited, with its days and exercises, ordered for display. */
export async function getWeek(weekStart: string): Promise<WeekDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("program_weeks")
    .select(
      `id, user_id, label, week_start, status, notes, created_at,
       days:program_days (
         id, day_index, name, focus_note, is_rest,
         exercises:program_exercises (
           id, position, target_sets, rep_min, rep_max, per_side, note, target_weight_kg,
           exercise:exercises ( id, name, slug, primary_muscle, equipment, image_start_url )
         )
       )`,
    )
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const week = data as unknown as WeekDetail;
  week.days.sort((a, b) => a.day_index - b.day_index);
  for (const day of week.days) day.exercises.sort((a, b) => a.position - b.position);
  return week;
}

export async function listWeeks(): Promise<
  Pick<ProgramWeek, "id" | "label" | "week_start" | "status">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("program_weeks")
    .select("id, label, week_start, status")
    .order("week_start", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

/** The most recent week before `weekStart` with the given status. */
export async function findPreviousWeek(weekStart: string, status?: WeekStatus) {
  const supabase = await createClient();
  let query = supabase
    .from("program_weeks")
    .select("id, label, week_start, status")
    .lt("week_start", weekStart)
    .order("week_start", { ascending: false })
    .limit(1);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

/** Global seed rows plus the user's own movements. RLS handles the filtering. */
export async function getLibrary(): Promise<LibraryExercise[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exercises")
    .select("id, name, slug, aliases, primary_muscle, equipment, image_start_url")
    .order("name");
  if (error) throw error;
  return data ?? [];
}
