import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, type SidebarSummary } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { goalLabel, goalLine } from "@/lib/profile";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, goal, unit_system")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ?? user.email?.split("@")[0] ?? "Athlete";
  const goal = profile?.goal ?? "cut";

  // Phase 1 has no weigh-ins or sessions yet — the shell shows honest empty
  // states rather than the mockup's sample numbers.
  const summary: SidebarSummary = {
    eyebrow: goalLabel(goal),
    value: null,
    caption: "Log your first weigh-in to start the trend.",
    progress: 0,
  };

  return (
    <div className="flex min-h-svh bg-bg text-fg">
      <Sidebar
        displayName={displayName}
        avatarUrl={profile?.avatar_url ?? null}
        goalLine={goalLine({ goal })}
        summary={summary}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          displayName={displayName}
          avatarUrl={profile?.avatar_url ?? null}
          goalLabel={goalLine({ goal })}
          streakDays={0}
        />
        <main className="flex-1 animate-rise-in px-[30px] pt-[26px] pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
