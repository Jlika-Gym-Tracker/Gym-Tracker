import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExcludes, getTargets } from "@/lib/nutrition/queries";
import { getMyCoaches } from "@/lib/coach/queries";
import { ProfileScreen } from "@/components/profile/profile-screen";
import type { CrewMember, SharingPrefs, UserSettings } from "@/lib/database.types";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: settings },
    { data: sharing },
    excludes,
    targets,
    coaches,
    { data: crew },
    { data: invites },
    { count: sessions },
    { count: weeks },
    { count: photos },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").maybeSingle(),
    supabase.from("sharing_prefs").select("*").maybeSingle(),
    getExcludes(),
    getTargets(),
    getMyCoaches(),
    supabase.rpc("crew_overview"),
    supabase
      .from("crew_invites")
      .select("*")
      .gt("uses_left", 0)
      .order("created_at", { ascending: false }),
    supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .not("ended_at", "is", null),
    supabase.from("program_weeks").select("id", { count: "exact", head: true }),
    supabase.from("progress_photos").select("id", { count: "exact", head: true }),
  ]);

  if (!profile) redirect("/login");

  // Defaults matching the table, for the window between signup and the trigger
  // rows existing (or for accounts created before those migrations ran).
  const resolvedSettings: UserSettings = settings ?? {
    user_id: user.id,
    training_days: [0, 1, 3, 4],
    default_rest_seconds: 90,
    auto_rest: true,
    keyboard_shortcuts: true,
    show_e1rm: false,
    deficit_kcal: 400,
    protein_g_per_kg: 2.4,
    fat_pct: 0.28,
    refeed_day: null,
    auto_adjust: true,
    ask_before_adjust: true,
    blur_thumbnails: false,
    strip_exif: true,
    notify_weighin: true,
    notify_unpublished_week: true,
    meals_per_day: 4,
    week_starts_on: 1,
  };

  const resolvedSharing: SharingPrefs = sharing ?? {
    user_id: user.id,
    share_sessions: true,
    share_streak: true,
    share_program_name: true,
  };

  return (
    <ProfileScreen
      profile={profile}
      settings={resolvedSettings}
      sharing={resolvedSharing}
      excludes={excludes}
      crew={(crew ?? []) as CrewMember[]}
      invites={invites ?? []}
      targets={targets.ok ? targets.targets : null}
      email={user.email ?? ""}
      stats={{ sessions: sessions ?? 0, weeks: weeks ?? 0, photos: photos ?? 0 }}
      coaches={coaches}
    />
  );
}
