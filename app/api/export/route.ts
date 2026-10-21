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

  // Every query names the account explicitly. RLS alone is not enough here: a
  // coach can read their athletes' training, and an export must hold only the
  // caller's own rows.
  const uid = user.id;
  // Drops the join used only for the ownership filter.
  const strip = <T extends Record<string, unknown>>(rows: T[], key: string) =>
    rows.map((row) => {
      const copy: Record<string, unknown> = { ...row };
      delete copy[key];
      return copy;
    });

  const [
    profile, settings, sharing, weeks, days, planned, exercises, sessions, sets,
    metrics, photos, plans, entries, groceries, excludes, crew,
    intakes, proposals, changes, snapshots,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", uid).maybeSingle(),
    supabase.from("sharing_prefs").select("*").eq("user_id", uid).maybeSingle(),
    everyRow(() => supabase.from("program_weeks").select("*").eq("user_id", uid).order("id")),
    everyRow(() =>
      supabase.from("program_days").select("*, owner:program_weeks!inner(user_id)")
        .eq("owner.user_id", uid).order("id"),
    ),
    everyRow(() =>
      supabase.from("program_exercises").select("*, day:program_days!inner(week:program_weeks!inner(user_id))")
        .eq("day.week.user_id", uid).order("id"),
    ),
    everyRow(() => supabase.from("exercises").select("*").eq("owner_id", uid).order("id")),
    everyRow(() => supabase.from("workout_sessions").select("*").eq("user_id", uid).order("id")),
    everyRow(() =>
      supabase.from("set_logs").select("*, owner:workout_sessions!inner(user_id)")
        .eq("owner.user_id", uid).order("id"),
    ),
    everyRow(() => supabase.from("body_metrics").select("*").eq("user_id", uid).order("id")),
    everyRow(() => supabase.from("progress_photos").select("*").eq("user_id", uid).order("id")),
    everyRow(() => supabase.from("meal_plans").select("*").eq("user_id", uid).order("id")),
    everyRow(() =>
      supabase.from("meal_plan_entries").select("*, owner:meal_plans!inner(user_id)")
        .eq("owner.user_id", uid).order("id"),
    ),
    everyRow(() =>
      supabase.from("grocery_items").select("*, owner:meal_plans!inner(user_id)")
        .eq("owner.user_id", uid).order("id"),
    ),
    everyRow(() => supabase.from("user_excludes").select("*").eq("user_id", uid).order("value")),
    everyRow(() => supabase.from("crew_links").select("*").eq("user_id", uid).order("friend_id")),
    everyRow(() => supabase.from("ai_coach_intakes").select("*").eq("user_id", uid).order("user_id")),
    everyRow(() => supabase.from("ai_coach_proposals").select("*").eq("user_id", uid).order("id")),
    everyRow(() =>
      supabase.from("ai_coach_changes").select("*, owner:ai_coach_proposals!inner(user_id)")
        .eq("owner.user_id", uid).order("id"),
    ),
    everyRow(() => supabase.from("ai_coach_snapshots").select("*").eq("user_id", uid).order("id")),
  ]);

  const document = {
    exported_at: new Date().toISOString(),
    app: "JLIKA Gym",
    schema_note:
      "Weights are kilograms, lengths centimetres, distances metres, durations seconds; dates are calendar dates in the account's local sense. Effort is stored as RPE.",
    account: { id: user.id, email: user.email },
    profile: profile.data,
    user_settings: settings.data,
    sharing_prefs: sharing.data,
    program_weeks: weeks,
    program_days: strip(days, "owner"),
    program_exercises: strip(planned, "day"),
    custom_exercises: exercises,
    workout_sessions: sessions,
    set_logs: strip(sets, "owner"),
    body_metrics: metrics,
    progress_photos: photos,
    meal_plans: plans,
    meal_plan_entries: strip(entries, "owner"),
    grocery_items: strip(groceries, "owner"),
    user_excludes: excludes,
    crew_links: crew,
    ai_coach: {
      intakes,
      proposals,
      changes: strip(changes, "owner"),
      snapshots,
    },
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

  const rows = photos;
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

/**
 * Every row a query matches, a page at a time. PostgREST stops at 1000 rows
 * per request, and an export that quietly ends there would lose a lifter's
 * older sets. Queries must have a stable order for the pages to line up.
 */
async function everyRow<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
