"use server";

import { revalidatePath } from "next/cache";
import { addDays, addWeeks } from "date-fns";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toDateString } from "@/lib/dates";
import { rollingAverage } from "@/lib/body/stats";
import { topThreeE1rmAverage } from "@/lib/league";
import { getMetrics } from "@/lib/body/queries";

export type ActionState = { error?: string; notice?: string };

const uuid = z.uuid();

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, user };
}

function fail(error: unknown): ActionState {
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

function refresh() {
  revalidatePath("/league");
  revalidatePath("/");
}

/**
 * Snapshots the baseline everything in the season is measured against.
 *
 * Weight and waist come from a 7-day average, not the reading on the day, so a
 * member cannot dehydrate their way to a favourable starting point.
 */
async function captureBaseline() {
  const supabase = await createClient();
  const metrics = await getMetrics(60);

  const { data: sets } = await supabase
    .from("set_logs")
    .select("exercise_id, weight_kg, reps")
    .eq("is_complete", true)
    .not("weight_kg", "is", null)
    .not("reps", "is", null)
    .order("logged_at", { ascending: false })
    .limit(400);

  return {
    start_weight_kg: rollingAverage(metrics, "weight_kg", 7),
    start_waist_cm: rollingAverage(metrics, "waist_cm", 14),
    start_e1rm: topThreeE1rmAverage(
      (sets ?? []).map((s) => ({
        exerciseId: s.exercise_id,
        weightKg: Number(s.weight_kg),
        reps: s.reps!,
      })),
    ),
  };
}

/** Creates a 12-week season and enrols the creator with a baseline. */
export async function createSeason(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const name = z.string().trim().min(1).max(60).parse(formData.get("name") || "Season 1");
    const startsOn = toDateString(new Date());

    const { data: season, error } = await supabase
      .from("league_seasons")
      .insert({
        crew_owner_id: user.id,
        name,
        starts_on: startsOn,
        ends_on: toDateString(addWeeks(new Date(), 12)),
      })
      .select("id")
      .single();
    if (error) throw error;

    const baseline = await captureBaseline();
    const { error: memberError } = await supabase
      .from("league_members")
      .insert({ season_id: season.id, user_id: user.id, ...baseline });
    if (memberError) throw memberError;

    refresh();
    return { notice: `${name} starts today and runs for 12 weeks.` };
  } catch (error) {
    return fail(error);
  }
}

export async function joinSeason(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const seasonId = uuid.parse(formData.get("seasonId"));

    const baseline = await captureBaseline();
    const { error } = await supabase
      .from("league_members")
      .upsert(
        { season_id: seasonId, user_id: user.id, ...baseline },
        { onConflict: "season_id,user_id" },
      );
    if (error) throw error;

    refresh();
    return { notice: "You're in. Your baseline is today's rolling average." };
  } catch (error) {
    return fail(error);
  }
}

export async function leaveSeason(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("league_members")
      .delete()
      .eq("season_id", uuid.parse(formData.get("seasonId")))
      .eq("user_id", user.id);
    if (error) throw error;
    refresh();
    return { notice: "You left the season." };
  } catch (error) {
    return fail(error);
  }
}

const challengeSchema = z.object({
  seasonId: z.union([z.literal(""), uuid]).transform((v) => v || null),
  kind: z.enum(["crew", "head_to_head", "personal"]),
  metric: z.enum(["sessions", "sets", "waist_pct", "weight_pct", "protein_days", "streak"]),
  title: z.string().trim().min(3).max(80),
  target: z.coerce.number().min(0).max(10000),
  stakes: z.union([z.literal(""), z.string().trim().max(120)]).transform((v) => v || null),
  days: z.coerce.number().int().min(1).max(90),
  opponentId: z.union([z.literal(""), uuid]).transform((v) => v || null),
});

export async function createChallenge(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = challengeSchema.parse({
      seasonId: formData.get("seasonId") ?? "",
      kind: formData.get("kind"),
      metric: formData.get("metric"),
      title: formData.get("title"),
      target: formData.get("target"),
      stakes: formData.get("stakes") ?? "",
      days: formData.get("days") ?? 7,
      opponentId: formData.get("opponentId") ?? "",
    });

    if (input.kind === "head_to_head" && !input.opponentId) {
      return { error: "Pick who you are challenging." };
    }

    const { data: challenge, error } = await supabase
      .from("challenges")
      .insert({
        season_id: input.seasonId,
        creator_id: user.id,
        kind: input.kind,
        metric: input.metric,
        title: input.title,
        target: input.target,
        stakes: input.stakes,
        starts_on: toDateString(new Date()),
        ends_on: toDateString(addDays(new Date(), input.days)),
        // A personal challenge needs nobody's agreement, so it starts live.
        status: input.kind === "personal" ? "live" : "pending",
      })
      .select("id")
      .single();
    if (error) throw error;

    const participants = [{ challenge_id: challenge.id, user_id: user.id, accepted: true }];
    if (input.kind === "head_to_head" && input.opponentId) {
      participants.push({
        challenge_id: challenge.id,
        user_id: input.opponentId,
        accepted: false,
      });
    }
    await supabase.from("challenge_participants").insert(participants);

    refresh();
    return {
      notice:
        input.kind === "personal"
          ? "Challenge started. Only you can see this one."
          : "Challenge sent. It goes live when they accept.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function respondToChallenge(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const challengeId = uuid.parse(formData.get("challengeId"));
    const accept = formData.get("accept") === "yes";

    const { error } = await supabase
      .from("challenge_participants")
      .update({ accepted: accept })
      .eq("challenge_id", challengeId)
      .eq("user_id", user.id);
    if (error) throw error;

    // Live once everyone has said yes; declined the moment anyone says no.
    if (accept) {
      const { data: pending } = await supabase
        .from("challenge_participants")
        .select("accepted")
        .eq("challenge_id", challengeId)
        .eq("accepted", false);
      if (!pending?.length) {
        await supabase.from("challenges").update({ status: "live" }).eq("id", challengeId);
      }
    } else {
      await supabase.from("challenges").update({ status: "declined" }).eq("id", challengeId);
    }

    refresh();
    return { notice: accept ? "Challenge accepted." : "Challenge declined." };
  } catch (error) {
    return fail(error);
  }
}
