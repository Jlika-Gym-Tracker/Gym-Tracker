import "server-only";
import { subDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { toDateString } from "@/lib/dates";
import type { Pose, ProgressPhoto } from "@/lib/database.types";
import type { Metric } from "./stats";

/** Signed URLs are short-lived on purpose — never hand out a durable link. */
const SIGNED_URL_TTL_SECONDS = 60;

export type PhotoWithUrl = ProgressPhoto & { url: string | null };

export async function getMetrics(limit = 400): Promise<Metric[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("body_metrics")
    .select(
      "measured_on, weight_kg, waist_cm, chest_cm, arm_cm, thigh_cm, hip_cm, bodyfat_pct",
    )
    .order("measured_on", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Metric[];
}

export async function getMetricForDate(date: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("body_metrics")
    .select("*")
    .eq("measured_on", date)
    .maybeSingle();
  return data;
}

/**
 * Photos with freshly signed URLs.
 *
 * The bucket is private, so the browser can only load an image through a URL
 * minted here, on the server, for this request. They expire in a minute.
 */
export async function getPhotos(pose?: Pose, limit = 40): Promise<PhotoWithUrl[]> {
  const supabase = await createClient();
  let query = supabase
    .from("progress_photos")
    .select("*")
    .order("taken_on", { ascending: false })
    .limit(limit);
  if (pose) query = query.eq("pose", pose);

  const { data, error } = await query;
  if (error) throw error;
  const photos = data ?? [];
  if (photos.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from("progress-photos")
    .createSignedUrls(
      photos.map((p) => p.storage_path),
      SIGNED_URL_TTL_SECONDS,
    );

  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? null]),
  );
  return photos.map((p) => ({ ...p, url: urlByPath.get(p.storage_path) ?? null }));
}

/** The oldest and newest photo of a pose — the two sides of the comparison slider. */
export async function getComparisonPair(pose: Pose) {
  const photos = await getPhotos(pose, 60);
  if (photos.length === 0) return { before: null, after: null, timeline: [] };
  const sorted = [...photos].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  return {
    before: sorted[0]!,
    after: sorted[sorted.length - 1]!,
    timeline: sorted,
  };
}

/**
 * Average estimated 1RM of the three heaviest movements, week by week — the
 * "am I keeping strength while cutting" line.
 */
export async function getStrengthSeries(weeks = 12) {
  const supabase = await createClient();
  const since = toDateString(subDays(new Date(), weeks * 7));

  const { data } = await supabase
    .from("set_logs")
    .select("exercise_id, weight_kg, reps, logged_at")
    .eq("is_complete", true)
    .gte("logged_at", since)
    .order("logged_at");

  return (data ?? []).map((row) => ({
    exerciseId: row.exercise_id,
    date: row.logged_at.slice(0, 10),
    weightKg: Number(row.weight_kg ?? 0),
    reps: row.reps ?? 0,
  }));
}
