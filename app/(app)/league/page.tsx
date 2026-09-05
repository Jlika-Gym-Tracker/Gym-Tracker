import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSeasonView, getSeasons } from "@/lib/league-data/queries";
import { LeagueScreen } from "@/components/league/league-screen";
import { NewSeasonPrompt } from "@/components/league/new-season-prompt";

export default async function LeaguePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: requested } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const seasons = await getSeasons();
  if (seasons.length === 0) return <NewSeasonPrompt />;

  const season = seasons.find((s) => s.id === requested) ?? seasons[0]!;
  const view = await getSeasonView(season);
  if (!view) return <NewSeasonPrompt />;

  return <LeagueScreen view={view} meId={user.id} />;
}
