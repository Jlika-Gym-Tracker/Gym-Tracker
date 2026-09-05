import "server-only";
import { differenceInCalendarWeeks, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import type { Badge, Challenge, LeagueSeason, LeagueStandingRow } from "@/lib/database.types";
import type { Standing } from "@/lib/league";

export type SeasonView = {
  season: LeagueSeason;
  weekIndex: number;
  totalWeeks: number;
  standings: Standing[];
  cumulative: { label: string; [name: string]: number | string }[];
  challenges: (Challenge & {
    participants: { user_id: string; accepted: boolean; progress: number; name: string }[];
  })[];
  badges: Badge[];
  isMember: boolean;
};

/** Every season the caller can see — theirs, or one they were added to. */
export async function getSeasons(): Promise<LeagueSeason[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("league_seasons")
    .select("*")
    .order("starts_on", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSeasonView(season: LeagueSeason): Promise<SeasonView | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("league_members")
    .select("user_id")
    .eq("season_id", season.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isMember = Boolean(membership);
  if (!isMember) {
    return {
      season, isMember: false,
      weekIndex: weekIndexOf(season),
      totalWeeks: totalWeeksOf(season),
      standings: [], cumulative: [], challenges: [], badges: [],
    };
  }

  const [{ data: rows }, { data: scores }, { data: challenges }, { data: badges }] =
    await Promise.all([
      supabase.rpc("league_standings", { target_season: season.id }),
      supabase
        .from("league_scores")
        .select("user_id, week_index, consistency_pts, transformation_pts")
        .eq("season_id", season.id)
        .order("week_index"),
      supabase
        .from("challenges")
        .select("*, participants:challenge_participants ( user_id, accepted, progress )")
        .or(`season_id.eq.${season.id},season_id.is.null`)
        .order("created_at", { ascending: false }),
      supabase.from("badges").select("*").eq("season_id", season.id),
    ]);

  const standingRows = (rows ?? []) as LeagueStandingRow[];
  const nameById = new Map(standingRows.map((r) => [r.user_id, r.display_name]));

  const standings: Standing[] = standingRows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    consistencyPts: row.consistency_pts,
    transformationPts: row.transformation_pts,
    sessions: row.sessions,
    plannedSessions: 0,
    goalProgressPct: Number(row.goal_progress_pct ?? 0),
    weekDots: row.week_dots ?? [],
  }));

  // Running totals per member, for the cumulative points chart.
  const weeks = [...new Set((scores ?? []).map((s) => s.week_index))].sort((a, b) => a - b);
  const running = new Map<string, number>();
  const cumulative = weeks.map((week) => {
    const point: { label: string; [name: string]: number | string } = {
      label: `W${week + 1}`,
    };
    for (const row of scores ?? []) {
      if (row.week_index !== week) continue;
      const name = nameById.get(row.user_id) ?? "Unknown";
      running.set(name, (running.get(name) ?? 0) + row.consistency_pts + row.transformation_pts);
    }
    for (const [name, total] of running) point[name] = total;
    return point;
  });

  return {
    season,
    isMember: true,
    weekIndex: weekIndexOf(season),
    totalWeeks: totalWeeksOf(season),
    standings,
    cumulative,
    challenges: (challenges ?? []).map((c) => ({
      ...c,
      participants: (
        (c as unknown as {
          participants: { user_id: string; accepted: boolean; progress: number }[];
        }).participants ?? []
      ).map((p) => ({ ...p, name: nameById.get(p.user_id) ?? "Someone" })),
    })) as SeasonView["challenges"],
    badges: badges ?? [],
  };
}

function weekIndexOf(season: LeagueSeason) {
  return Math.max(
    0,
    differenceInCalendarWeeks(new Date(), parseISO(season.starts_on), { weekStartsOn: 1 }),
  );
}

function totalWeeksOf(season: LeagueSeason) {
  return Math.max(
    1,
    differenceInCalendarWeeks(parseISO(season.ends_on), parseISO(season.starts_on), {
      weekStartsOn: 1,
    }),
  );
}
