"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
  revalidatePath("/progress");
  revalidatePath("/");
}

/** Blank strings mean "not measured today", which is different from zero. */
const optionalNumber = (min: number, max: number) =>
  z
    .union([z.literal(""), z.coerce.number().min(min).max(max)])
    .transform((v) => (v === "" ? null : v))
    .nullable();

const metricSchema = z.object({
  measuredOn: z.iso.date(),
  weightKg: optionalNumber(20, 400),
  waistCm: optionalNumber(30, 250),
  chestCm: optionalNumber(30, 250),
  armCm: optionalNumber(10, 100),
  thighCm: optionalNumber(20, 150),
  hipCm: optionalNumber(30, 250),
  bodyfatPct: optionalNumber(1, 79),
  note: z.string().trim().max(300).nullable(),
});

/**
 * Saves a day's measurements. Upserts on (user_id, measured_on) so logging
 * twice in one day corrects the entry instead of creating a duplicate.
 */
export async function saveMetrics(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const input = metricSchema.parse({
      measuredOn: formData.get("measuredOn"),
      weightKg: formData.get("weightKg") ?? "",
      waistCm: formData.get("waistCm") ?? "",
      chestCm: formData.get("chestCm") ?? "",
      armCm: formData.get("armCm") ?? "",
      thighCm: formData.get("thighCm") ?? "",
      hipCm: formData.get("hipCm") ?? "",
      bodyfatPct: formData.get("bodyfatPct") ?? "",
      note: (formData.get("note") as string)?.trim() || null,
    });

    const values = {
      weight_kg: input.weightKg,
      waist_cm: input.waistCm,
      chest_cm: input.chestCm,
      arm_cm: input.armCm,
      thigh_cm: input.thighCm,
      hip_cm: input.hipCm,
      bodyfat_pct: input.bodyfatPct,
    };
    if (Object.values(values).every((v) => v == null)) {
      return { error: "Fill in at least one measurement." };
    }

    const { error } = await supabase.from("body_metrics").upsert(
      { user_id: user.id, measured_on: input.measuredOn, note: input.note, ...values },
      { onConflict: "user_id,measured_on" },
    );
    if (error) throw error;

    refresh();
    return { notice: "Saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteMetric(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("body_metrics")
      .delete()
      .eq("measured_on", z.iso.date().parse(formData.get("measuredOn")));
    if (error) throw error;
    refresh();
    return {};
  } catch (error) {
    return fail(error);
  }
}

/**
 * Issues a one-time upload target for a progress photo.
 *
 * The browser resizes and re-encodes to webp before calling this, then PUTs
 * straight to Storage with the signed token — the image never passes through
 * the Next server. The path is always {uid}/{uuid}.webp, which is what the
 * storage policy keys on.
 */
export async function createPhotoUploadTarget(): Promise<
  { path: string; token: string } | { error: string }
> {
  try {
    const { supabase, user } = await requireUser();
    const path = `${user.id}/${crypto.randomUUID()}.webp`;
    const { data, error } = await supabase.storage
      .from("progress-photos")
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { path, token: data.token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload could not start.";
    return { error: message };
  }
}

const photoSchema = z.object({
  storagePath: z.string().min(3).max(200),
  takenOn: z.iso.date(),
  pose: z.enum(["front", "side", "back"]),
  weightKg: z.number().min(20).max(400).nullable(),
});

/** Records a photo row once the file is safely in Storage. */
export async function recordPhoto(input: {
  storagePath: string;
  takenOn: string;
  pose: "front" | "side" | "back";
  weightKg: number | null;
}): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser();
    const parsed = photoSchema.parse(input);

    // Never let a row point at somebody else's folder.
    if (!parsed.storagePath.startsWith(`${user.id}/`)) {
      return { error: "That upload path is not yours." };
    }

    const { error } = await supabase.from("progress_photos").insert({
      user_id: user.id,
      taken_on: parsed.takenOn,
      pose: parsed.pose,
      storage_path: parsed.storagePath,
      weight_kg: parsed.weightKg,
    });
    if (error) throw error;

    refresh();
    return { notice: "Photo added." };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePhoto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase } = await requireUser();
    const id = uuid.parse(formData.get("id"));

    const { data: photo } = await supabase
      .from("progress_photos")
      .select("storage_path")
      .eq("id", id)
      .maybeSingle();
    if (!photo) return { error: "That photo is already gone." };

    // Remove the object first: a dangling row is recoverable, an orphaned
    // private file is not visible anywhere to clean up later.
    await supabase.storage.from("progress-photos").remove([photo.storage_path]);
    const { error } = await supabase.from("progress_photos").delete().eq("id", id);
    if (error) throw error;

    refresh();
    return { notice: "Photo deleted." };
  } catch (error) {
    return fail(error);
  }
}
