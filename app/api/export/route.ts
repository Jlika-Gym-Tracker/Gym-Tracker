import { NextResponse, type NextRequest } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { createClient } from "@/lib/supabase/server";

/**
 * Account export.
 *
 * ?format=json  — every row this account owns, as one JSON document.
 * ?format=zip   — the same JSON plus every progress photo, fetched through
 *                 short-lived signed URLs and packed store-only (webp is
 *                 already compressed, so deflating it again buys nothing).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = request.nextUrl.searchParams.get("format") === "zip" ? "zip" : "json";

  // RLS scopes every one of these to the caller.
  const [
    profile, settings, sharing, weeks, days, exercises, sessions, sets,
    metrics, photos, plans, entries, groceries, excludes, crew,
  ] = await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(),
    supabase.from("user_settings").select("*").maybeSingle(),
    supabase.from("sharing_prefs").select("*").maybeSingle(),
    supabase.from("program_weeks").select("*"),
    supabase.from("program_days").select("*"),
    supabase.from("exercises").select("*").not("owner_id", "is", null),
    supabase.from("workout_sessions").select("*"),
    supabase.from("set_logs").select("*"),
    supabase.from("body_metrics").select("*"),
    supabase.from("progress_photos").select("*"),
    supabase.from("meal_plans").select("*"),
    supabase.from("meal_plan_entries").select("*"),
    supabase.from("grocery_items").select("*"),
    supabase.from("user_excludes").select("*"),
    supabase.from("crew_links").select("*"),
  ]);

  const document = {
    exported_at: new Date().toISOString(),
    app: "JLIKA Gym",
    schema_note:
      "Weights are kilograms, lengths centimetres, dates are calendar dates in the account's local sense.",
    account: { id: user.id, email: user.email },
    profile: profile.data,
    user_settings: settings.data,
    sharing_prefs: sharing.data,
    program_weeks: weeks.data ?? [],
    program_days: days.data ?? [],
    custom_exercises: exercises.data ?? [],
    workout_sessions: sessions.data ?? [],
    set_logs: sets.data ?? [],
    body_metrics: metrics.data ?? [],
    progress_photos: photos.data ?? [],
    meal_plans: plans.data ?? [],
    meal_plan_entries: entries.data ?? [],
    grocery_items: groceries.data ?? [],
    user_excludes: excludes.data ?? [],
    crew_links: crew.data ?? [],
  };

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new NextResponse(JSON.stringify(document, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="jlika-gym-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const files: Record<string, [Uint8Array, { level: 0 }]> = {
    "export.json": [strToU8(JSON.stringify(document, null, 2)), { level: 0 }],
  };

  const rows = photos.data ?? [];
  if (rows.length > 0) {
    const { data: signed } = await supabase.storage
      .from("progress-photos")
      .createSignedUrls(rows.map((p) => p.storage_path), 120);

    const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl]));

    await Promise.all(
      rows.map(async (photo) => {
        const url = urlByPath.get(photo.storage_path);
        if (!url) return;
        try {
          const response = await fetch(url);
          if (!response.ok) return;
          const bytes = new Uint8Array(await response.arrayBuffer());
          files[`photos/${photo.taken_on}-${photo.pose}-${photo.id.slice(0, 8)}.webp`] = [
            bytes,
            { level: 0 },
          ];
        } catch {
          // A single unreadable photo should not sink the whole export.
        }
      }),
    );
  }

  const zipped = zipSync(files);
  return new NextResponse(zipped as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="jlika-gym-export-${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
