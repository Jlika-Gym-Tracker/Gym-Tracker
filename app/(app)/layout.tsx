import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, type SidebarSummary } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { goalLabel, goalLine } from "@/lib/profile";
import { isAiCoachAvailable } from "@/lib/ai-coach/config";
import { getWeekStartsOn } from "@/lib/settings/week";
import { weekStreak, weightSummary } from "@/lib/training/streak";
import type { UnitSystem } from "@/lib/database.types";
import { AccentSync } from "@/components/shell/accent-sync";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Every query names the user: a coach's RLS also reaches their athletes' rows.
  const [{ data: profile }, { data: sessions }, { data: firstWeighIn }, { data: lastWeighIn }, weekStartsOn] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, avatar_url, goal, unit_system, onboarded_at, coaching_enabled, goal_weight_kg, accent")
        .eq("id", user.id)
        .maybeSingle(),
      // Two years of session dates is plenty for any streak worth showing.
      supabase
        .from("workout_sessions")
        .select("started_at")
        .eq("user_id", user.id)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(500),
      supabase
        .from("body_metrics")
        .select("weight_kg")
        .eq("user_id", user.id)
        .not("weight_kg", "is", null)
        .order("measured_on", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("body_metrics")
        .select("weight_kg")
        .eq("user_id", user.id)
        .not("weight_kg", "is", null)
        .order("measured_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getWeekStartsOn(),
    ]);

  // First run: collect the body details the calorie maths needs before showing
  // screens that would otherwise sit empty.
  if (profile && !profile.onboarded_at) redirect("/onboarding");

  const displayName =
    profile?.display_name ?? user.email?.split("@")[0] ?? "Athlete";
  const goal = profile?.goal ?? "cut";

  const summary: SidebarSummary = weightSummary({
    goalLabel: goalLabel(goal),
    firstKg: firstWeighIn?.weight_kg == null ? null : Number(firstWeighIn.weight_kg),
    currentKg: lastWeighIn?.weight_kg == null ? null : Number(lastWeighIn.weight_kg),
    goalWeightKg: profile?.goal_weight_kg == null ? null : Number(profile.goal_weight_kg),
    system: (profile?.unit_system ?? "metric") as UnitSystem,
  });
  const streakWeeks = weekStreak(
    (sessions ?? []).map((s) => s.started_at.slice(0, 10)),
    { weekStartsOn },
  );

  // No key on the server, no AI Coach anywhere: not in the nav, not routable.
  const aiCoach = isAiCoachAvailable();

  return (
    <div className="flex min-h-svh bg-bg text-fg">
      <Sidebar
        displayName={displayName}
        avatarUrl={profile?.avatar_url ?? null}
        goalLine={goalLine({ goal })}
        summary={summary}
        coaching={profile?.coaching_enabled ?? false}
        aiCoach={aiCoach}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          displayName={displayName}
          avatarUrl={profile?.avatar_url ?? null}
          goalLabel={goalLine({ goal })}
          streakWeeks={streakWeeks}
          coaching={profile?.coaching_enabled ?? false}
        />
        {/* Bottom padding on phones clears the fixed tab bar (or the live
            session's bar, which is the same height) plus the home indicator. */}
        <main className="flex-1 animate-rise-in px-4 pt-4 pb-[calc(88px+env(safe-area-inset-bottom))] lg:px-[30px] lg:pt-[26px] lg:pb-10">
          {children}
        </main>
      </div>
      <AccentSync accent={profile?.accent ?? "lime"} />
      <MobileNav aiCoach={aiCoach} />
    </div>
  );
}
