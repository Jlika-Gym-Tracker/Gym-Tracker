"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDays } from "date-fns";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { displayToCm } from "@/lib/units";

export type ActionState = { error?: string; notice?: string };

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
  revalidatePath("/profile");
  revalidatePath("/", "layout");
}

const unitSystem = z.enum(["metric", "imperial"]);

const accountSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  sex: z.enum(["male", "female", "other"]).nullable(),
  birthDate: z.union([z.literal(""), z.iso.date()]).transform((v) => v || null),
  height: z.union([z.literal(""), z.coerce.number().min(80).max(260)]).transform((v) => (v === "" ? null : v)),
  unitSystem,
  goal: z.enum(["cut", "bulk", "recomp", "strength", "health"]),
  activityFactor: z.coerce.number().min(1.2).max(2),
});

export async function saveAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = accountSchema.parse({
      displayName: formData.get("displayName"),
      sex: (formData.get("sex") as string) || null,
      birthDate: formData.get("birthDate") ?? "",
      height: formData.get("height") ?? "",
      unitSystem: formData.get("unitSystem"),
      goal: formData.get("goal"),
      activityFactor: formData.get("activityFactor"),
    });

    // Heights arrive in whatever the user is looking at; kg/cm go to the table.
    const heightCm =
      input.height == null ? null : displayToCm(input.height, input.unitSystem);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: input.displayName,
        sex: input.sex,
        birth_date: input.birthDate,
        height_cm: heightCm == null ? null : Math.round(heightCm * 10) / 10,
        unit_system: input.unitSystem,
        goal: input.goal,
        activity_factor: input.activityFactor,
      })
      .eq("id", user.id);
    if (error) throw error;

    refresh();
    return { notice: "Account saved." };
  } catch (error) {
    return fail(error);
  }
}

const targetsSchema = z.object({
  deficitKcal: z.coerce.number().int().min(0).max(1200),
  proteinGPerKg: z.coerce.number().min(1).max(4),
  fatPct: z.coerce.number().min(15).max(60),
  trainingDayBonus: z.coerce.number().int().min(0).max(800),
  trainingDays: z.array(z.coerce.number().int().min(0).max(6)),
  mealsPerDay: z.coerce.number().int().min(3).max(5),
  refeedDay: z.union([z.literal(""), z.coerce.number().int().min(0).max(6)]).transform((v) => (v === "" ? null : v)),
  autoAdjust: z.boolean(),
  askBeforeAdjust: z.boolean(),
});

/**
 * Writes the target settings and mirrors the resulting numbers onto profiles,
 * so anything reading targets does not have to recompute them.
 */
export async function saveTargets(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = targetsSchema.parse({
      deficitKcal: formData.get("deficitKcal"),
      proteinGPerKg: formData.get("proteinGPerKg"),
      fatPct: formData.get("fatPct"),
      trainingDayBonus: formData.get("trainingDayBonus"),
      trainingDays: formData.getAll("trainingDays"),
      mealsPerDay: formData.get("mealsPerDay"),
      refeedDay: formData.get("refeedDay") ?? "",
      autoAdjust: formData.get("autoAdjust") === "on",
      askBeforeAdjust: formData.get("askBeforeAdjust") === "on",
    });

    const { error: settingsError } = await supabase.from("user_settings").upsert(
      {
        user_id: user.id,
        deficit_kcal: input.deficitKcal,
        protein_g_per_kg: input.proteinGPerKg,
        fat_pct: input.fatPct / 100,
        training_days: [...new Set(input.trainingDays)].sort(),
        meals_per_day: input.mealsPerDay,
        refeed_day: input.refeedDay,
        auto_adjust: input.autoAdjust,
        ask_before_adjust: input.askBeforeAdjust,
      },
      { onConflict: "user_id" },
    );
    if (settingsError) throw settingsError;

    await supabase
      .from("profiles")
      .update({ training_day_kcal_bonus: input.trainingDayBonus })
      .eq("id", user.id);

    await recalculateTargets();
    refresh();
    revalidatePath("/nutrition");
    return { notice: "Targets updated. They apply from tomorrow's plan." };
  } catch (error) {
    return fail(error);
  }
}

/** Recomputes calorie/macro targets and caches them on the profile row. */
export async function recalculateTargets(): Promise<void> {
  const { getTargets } = await import("@/lib/nutrition/queries");
  const result = await getTargets();
  if (!result.ok) return;

  const { supabase, user } = await requireUser();
  await supabase
    .from("profiles")
    .update({
      calorie_target: result.targets.calories,
      protein_target_g: result.targets.proteinG,
      carb_target_g: result.targets.carbG,
      fat_target_g: result.targets.fatG,
    })
    .eq("id", user.id);
}

const settingsToggleSchema = z.object({
  key: z.enum([
    "auto_rest", "keyboard_shortcuts", "show_e1rm", "blur_thumbnails",
    "strip_exif", "notify_weighin", "notify_unpublished_week",
  ]),
  value: z.boolean(),
});

export async function toggleSetting(
  key: string,
  value: boolean,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = settingsToggleSchema.parse({ key, value });
    // A computed key would widen the object past what the Insert type accepts.
    const patch: Partial<Record<typeof input.key, boolean>> = {
      [input.key]: input.value,
    };
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

export async function setRestSeconds(seconds: number): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const value = z.number().int().min(15).max(600).parse(seconds);
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, default_rest_seconds: value }, { onConflict: "user_id" });
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

const sharingSchema = z.object({
  key: z.enum(["share_sessions", "share_streak", "share_program_name"]),
  value: z.boolean(),
});

export async function toggleSharing(key: string, value: boolean): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = sharingSchema.parse({ key, value });
    const patch: Partial<Record<typeof input.key, boolean>> = {
      [input.key]: input.value,
    };
    const { error } = await supabase
      .from("sharing_prefs")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/** Codes read like CREW-7K2P — no ambiguous characters. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const body = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `CREW-${body}`;
}

export async function createInvite(): Promise<ActionState & { code?: string }> {
  try {
    const { supabase, user } = await requireUser();

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { error } = await supabase.from("crew_invites").insert({
        code,
        inviter_id: user.id,
        uses_left: 3,
        expires_at: addDays(new Date(), 14).toISOString(),
      });
      if (!error) {
        refresh();
        return { code, notice: "Invite code created. It lasts 14 days." };
      }
      // 23505 is a unique violation — try another code.
      if (error.code !== "23505") throw error;
    }
    return { error: "Could not generate a unique code. Try again." };
  } catch (error) {
    return fail(error);
  }
}

export async function redeemInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const code = z
      .string()
      .trim()
      .min(4)
      .max(20)
      .parse(formData.get("code"))
      .toUpperCase();

    const { data, error } = await supabase.rpc("redeem_crew_invite", {
      invite_code: code,
    });
    if (error) return { error: error.message };

    const friend = data?.[0];
    refresh();
    revalidatePath("/league");
    return { notice: friend ? `You and ${friend.friend_name} are now crew.` : "Joined." };
  } catch (error) {
    return fail(error);
  }
}

export async function removeCrewLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const friendId = z.uuid().parse(formData.get("friendId"));

    // Break it in both directions — a one-sided link would be worse than none.
    await supabase.from("crew_links").delete().eq("friend_id", friendId);
    await supabase
      .from("crew_links")
      .delete()
      .eq("user_id", friendId)
      .eq("friend_id", user.id);

    refresh();
    return { notice: "Removed from your crew." };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Deletes the account: storage objects first, then the auth user, whose FK
 * cascades take every table row with it. Requires the service role key, so it
 * fails loudly rather than half-deleting if that is not configured.
 */
export async function deleteAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();

    const confirmation = String(formData.get("confirm") ?? "").trim();
    if (confirmation !== "DELETE") {
      return { error: 'Type DELETE exactly to confirm.' };
    }

    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    if (!serviceKey) {
      return {
        error:
          "Account deletion needs SUPABASE_SECRET_KEY set on the server. Nothing was deleted.",
      };
    }

    const { data: photos } = await supabase
      .from("progress_photos")
      .select("storage_path");
    if (photos?.length) {
      await supabase.storage
        .from("progress-photos")
        .remove(photos.map((p) => p.storage_path));
    }

    const { createClient: createAdminClient } = await import("@supabase/supabase-js");
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;

    await supabase.auth.signOut();
  } catch (error) {
    return fail(error);
  }
  redirect("/login?deleted=1");
}

/**
 * Which weekday this user's training week begins on.
 *
 * Existing weeks keep the start date they were written with — changing this
 * decides where the *next* week begins, and the screens resolve "this week" by
 * the range a week covers rather than by an exact weekday, so nothing written
 * under the old setting disappears.
 */
export async function setWeekStartsOn(day: number): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const value = z.number().int().min(0).max(6).parse(day);

    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, week_starts_on: value }, { onConflict: "user_id" });
    if (error) throw error;

    revalidatePath("/", "layout");
    return { notice: "Saved. New weeks will start on that day." };
  } catch (error) {
    return fail(error);
  }
}
