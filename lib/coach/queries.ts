import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CoachInvite, CoachProgram, RosterAthlete } from "@/lib/database.types";

export type CoachProgramDetail = CoachProgram & {
  days: {
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
      exercise: {
        id: string;
        name: string;
        primary_muscle: string;
        image_start_url: string | null;
      };
    }[];
  }[];
};

export async function getRoster(): Promise<RosterAthlete[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("coach_roster");
  if (error) throw error;
  return (data ?? []) as RosterAthlete[];
}

export async function getCoachPrograms(): Promise<CoachProgramDetail[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_programs")
    .select(
      `id, coach_id, name, notes, created_at,
       days:coach_program_days (
         id, day_index, name, focus_note, is_rest,
         exercises:coach_program_exercises (
           id, position, target_sets, rep_min, rep_max, per_side,
           exercise:exercises ( id, name, primary_muscle, image_start_url )
         )
       )`,
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  const programs = (data ?? []) as unknown as CoachProgramDetail[];
  for (const program of programs) {
    program.days.sort((a, b) => a.day_index - b.day_index);
    for (const day of program.days) day.exercises.sort((a, b) => a.position - b.position);
  }
  return programs;
}

export async function getCoachInvites(): Promise<CoachInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_invites")
    .select("*")
    .gt("uses_left", 0)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type MyCoach = {
  coach_id: string;
  status: "active" | "paused" | "ended";
  share_training: boolean;
  share_body_metrics: boolean;
  share_photos: boolean;
  share_nutrition: boolean;
  display_name: string;
  avatar_url: string | null;
};

/** The coaches an athlete has linked to, and exactly what each one can see. */
export async function getMyCoaches(): Promise<MyCoach[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("coach_links")
    .select("coach_id, status, share_training, share_body_metrics, share_photos, share_nutrition")
    .eq("athlete_id", user.id);
  if (error) throw error;
  const links = data ?? [];
  if (links.length === 0) return [];

  // profiles RLS only exposes your own row, so names come from the same
  // SECURITY DEFINER path the roster uses rather than a join.
  const { data: names } = await supabase.rpc("coach_names", {
    coach_ids: links.map((l) => l.coach_id),
  });
  const byId = new Map(
    (names ?? []).map((n) => [n.coach_id, n]),
  );

  return links.map((link) => ({
    ...link,
    status: link.status as MyCoach["status"],
    display_name: byId.get(link.coach_id)?.display_name ?? "Your coach",
    avatar_url: byId.get(link.coach_id)?.avatar_url ?? null,
  }));
}
