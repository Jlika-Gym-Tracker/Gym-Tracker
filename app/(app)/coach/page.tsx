import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCoachInvites, getCoachPrograms, getRoster } from "@/lib/coach/queries";
import { getLibrary } from "@/lib/program/queries";
import { CoachScreen } from "@/components/coach/coach-screen";
import { EnableCoaching } from "@/components/coach/enable-coaching";

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("coaching_enabled")
    .eq("id", user.id)
    .maybeSingle();

  // Coaching is opt-in; the screen explains what it means before turning it on.
  if (!profile?.coaching_enabled) return <EnableCoaching />;

  const [roster, programs, invites, library] = await Promise.all([
    getRoster(),
    getCoachPrograms(),
    getCoachInvites(),
    getLibrary(),
  ]);

  return (
    <CoachScreen
      roster={roster}
      programs={programs}
      invites={invites}
      library={library}
      meId={user.id}
    />
  );
}
