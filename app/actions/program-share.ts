"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dayLabel } from "@/lib/dates";
import { parseSharedWeek, planMerge, type SharedExercise } from "@/lib/program/share";
import { ownExerciseSlug } from "@/lib/program/own-exercise";
import { ensureWeek } from "./program";

export type ActionState = { error?: string; notice?: string };

/**
 * Brings someone's shared week into one of yours. It merges: any day you
 * already have exercises on is left exactly as it was, so a shared plan can
 * never overwrite yours. Library movements land on the same rows; movements
 * that were the sender's own become yours, or reuse one of yours with the same
 * name.
 */
export async function importSharedWeek(weekStart: string, text: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const start = z.iso.date().parse(weekStart);
    if (text.length > 200_000) return { error: "That file is far too big to be a shared week." };
    const parsed = parseSharedWeek(text);
    if (!parsed.ok) return { error: parsed.error };
    const incoming = parsed.week;

    const weekId = await ensureWeek(start, incoming.label);
    const { data: days, error: daysError } = await supabase
      .from("program_days")
      .select("id, day_index, program_exercises ( id )")
      .eq("week_id", weekId);
    if (daysError) throw daysError;

    const existing = (days ?? []).map((d) => ({
      id: d.id,
      day_index: d.day_index,
      exerciseCount: (d.program_exercises as unknown as { id: string }[] | null)?.length ?? 0,
    }));
    const { fill, kept } = planMerge(incoming, existing);
    if (fill.length === 0) {
      return { error: "Every day in that week already has your plan on it, so nothing was changed." };
    }

    const exerciseIds = await resolveExercises(
      supabase,
      user.id,
      fill.flatMap((d) => d.exercises),
    );

    let written = 0;
    for (const day of fill) {
      const row = existing.find((d) => d.day_index === day.dayIndex);
      if (!row) continue;
      const { error } = await supabase
        .from("program_days")
        .update({
          name: day.name,
          focus_note: day.focusNote,
          is_rest: day.isRest && day.exercises.length === 0,
          progression: day.progression,
        })
        .eq("id", row.id);
      if (error) throw error;

      if (day.exercises.length) {
        const { error: insertError } = await supabase.from("program_exercises").insert(
          day.exercises.map((item, position) => ({
            day_id: row.id,
            exercise_id: exerciseIds.get(item.slug)!,
            position,
            target_sets: item.targetSets,
            rep_min: item.repMin,
            rep_max: item.repMax,
            per_side: item.perSide,
            note: item.note,
            target_seconds: item.targetSeconds,
            superset_group: item.supersetGroup,
            progression: item.progression,
          })),
        );
        if (insertError) throw insertError;
        written += day.exercises.length;
      }
    }

    revalidatePath("/program");
    revalidatePath("/");
    const keptNote = kept.length
      ? ` Kept your ${kept.map((i) => dayLabel(start, i)).join(", ")} as they were.`
      : "";
    return {
      notice: `Imported “${incoming.label}” — ${written} exercises across ${fill.filter((d) => d.exercises.length).length} days.${keptNote}`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Slug in the file → exercise id here, creating the sender's own movements as yours. */
async function resolveExercises(supabase: Supabase, userId: string, items: SharedExercise[]) {
  const unique = new Map(items.map((i) => [i.slug, i]));
  const ids = new Map<string, string>();

  // RLS shows global rows plus your own, which is exactly the set to match.
  const { data: library } = await supabase.from("exercises").select("id, slug, name, owner_id");
  const bySlug = new Map((library ?? []).map((e) => [e.slug, e]));
  const ownByName = new Map(
    (library ?? []).filter((e) => e.owner_id).map((e) => [e.name.toLowerCase(), e]),
  );

  for (const [slug, item] of unique) {
    const hit = bySlug.get(slug) ?? ownByName.get(item.name.toLowerCase());
    if (hit) {
      ids.set(slug, hit.id);
      continue;
    }
    let created: string | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const { data, error } = await supabase
        .from("exercises")
        .insert({
          owner_id: userId,
          slug: ownExerciseSlug(userId, item.name, attempt),
          name: item.name,
          primary_muscle: item.primaryMuscle,
          equipment: item.equipment,
          tracking: item.tracking,
        })
        .select("id")
        .single();
      if (error?.code === "23505") continue;
      if (error) throw error;
      created = data.id;
    }
    if (!created) throw new Error(`Could not add “${item.name}” to your library.`);
    ids.set(slug, created);
  }
  return ids;
}
