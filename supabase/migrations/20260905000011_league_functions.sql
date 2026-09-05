-- JLIKA Gym — league standings and the nightly scoring job.
--
-- The scoring rules live twice on purpose: in lib/league.ts, where they are
-- unit-tested and drive the UI, and here in SQL, where the nightly job runs
-- them across every member without a round trip. The constants below must be
-- kept in step with lib/league.ts.

/**
 * Standings for a season, computed from league_scores.
 *
 * SECURITY DEFINER so it can read every member's scores, but it returns only
 * names, points and percentages — no kilograms, centimetres or set data.
 */
create or replace function public.league_standings(target_season uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  consistency_pts int,
  transformation_pts int,
  sessions int,
  goal_progress_pct numeric,
  week_dots int[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  week_start date := (date_trunc('week', now() at time zone 'utc'))::date;
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;

  -- Only members of the season may read its standings.
  if not exists (
    select 1 from public.league_members m
    where m.season_id = target_season and m.user_id = caller
  ) then
    raise exception 'You are not in that season';
  end if;

  return query
  with totals as (
    select s.user_id,
           coalesce(sum(s.consistency_pts), 0)::int as consistency_pts,
           coalesce(sum(s.transformation_pts), 0)::int as transformation_pts,
           coalesce(sum(s.sessions), 0)::int as sessions
    from public.league_scores s
    where s.season_id = target_season
    group by s.user_id
  ),
  latest_pct as (
    select distinct on (s.user_id) s.user_id, s.goal_progress_pct
    from public.league_scores s
    where s.season_id = target_season
    order by s.user_id, s.week_index desc
  ),
  dots as (
    select ws.user_id,
           array_agg(distinct extract(isodow from ws.started_at)::int - 1) as days
    from public.workout_sessions ws
    join public.league_members m
      on m.user_id = ws.user_id and m.season_id = target_season
    where ws.ended_at is not null and ws.started_at >= week_start
    group by ws.user_id
  )
  select
    m.user_id,
    p.display_name,
    p.avatar_url,
    coalesce(t.consistency_pts, 0),
    coalesce(t.transformation_pts, 0),
    coalesce(t.sessions, 0),
    lp.goal_progress_pct,
    coalesce(d.days, '{}'::int[])
  from public.league_members m
  join public.profiles p on p.id = m.user_id
  left join totals t on t.user_id = m.user_id
  left join latest_pct lp on lp.user_id = m.user_id
  left join dots d on d.user_id = m.user_id
  where m.season_id = target_season
  order by
    coalesce(t.consistency_pts, 0) + coalesce(t.transformation_pts, 0) desc,
    p.display_name;
end;
$$;

revoke all on function public.league_standings(uuid) from public;
grant execute on function public.league_standings(uuid) to authenticated;

/**
 * Recomputes league_scores for every member of every live season.
 *
 * Mirrors lib/league.ts: 120 per session capped at five a week, 10 per
 * completed set, goal-relative bodyweight change × 200, waist centimetres lost
 * × 40, and 150 for holding the top-three estimated 1RM average. Bodyweight and
 * waist are read as 7-day averages, never a single reading.
 */
create or replace function public.recompute_league_scores()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  season record;
  member record;
  week_idx int;
  week_from date;
  week_to date;
  sessions_count int;
  sets_count int;
  consistency int;
  avg_weight numeric;
  avg_waist numeric;
  member_goal text;
  progress numeric;
  waist_lost numeric;
  current_e1rm numeric;
  transformation int;
begin
  for season in
    select * from public.league_seasons where starts_on <= current_date
  loop
    for member in
      select m.*, p.goal
      from public.league_members m
      join public.profiles p on p.id = m.user_id
      where m.season_id = season.id
    loop
      member_goal := member.goal;
      week_idx := 0;
      week_from := season.starts_on;

      while week_from <= least(current_date, season.ends_on) loop
        week_to := week_from + 7;

        select count(*)::int into sessions_count
        from public.workout_sessions ws
        where ws.user_id = member.user_id
          and ws.ended_at is not null
          and ws.started_at >= week_from
          and ws.started_at < week_to;

        select count(*)::int into sets_count
        from public.set_logs sl
        join public.workout_sessions ws on ws.id = sl.session_id
        where ws.user_id = member.user_id
          and sl.is_complete
          and ws.started_at >= week_from
          and ws.started_at < week_to;

        consistency := least(sessions_count, 5) * 120 + sets_count * 10;

        -- Seven-day averages up to the end of this week.
        select avg(bm.weight_kg), avg(bm.waist_cm)
        into avg_weight, avg_waist
        from public.body_metrics bm
        where bm.user_id = member.user_id
          and bm.measured_on < week_to
          and bm.measured_on >= week_to - 7;

        progress := 0;
        if member.start_weight_kg is not null and avg_weight is not null then
          progress := case member_goal
            when 'cut' then (member.start_weight_kg - avg_weight) / member.start_weight_kg * 100
            when 'bulk' then (avg_weight - member.start_weight_kg) / member.start_weight_kg * 100
            when 'recomp' then
              case when abs((avg_weight - member.start_weight_kg) / member.start_weight_kg * 100) < 0.5
                then 0.5
                else -abs((avg_weight - member.start_weight_kg) / member.start_weight_kg * 100)
              end
            else 0
          end;
        elsif member_goal = 'recomp' then
          progress := 0.5;
        end if;

        waist_lost := 0;
        if member.start_waist_cm is not null and avg_waist is not null then
          waist_lost := greatest(0, member.start_waist_cm - avg_waist);
        end if;

        -- Mean Epley estimate of the three heaviest movements this week.
        select avg(best) into current_e1rm
        from (
          select max(sl.weight_kg * (1 + sl.reps / 30.0)) as best
          from public.set_logs sl
          join public.workout_sessions ws on ws.id = sl.session_id
          where ws.user_id = member.user_id
            and sl.is_complete
            and sl.weight_kg is not null and sl.reps is not null
            and ws.started_at >= week_from and ws.started_at < week_to
          group by sl.exercise_id
          order by best desc
          limit 3
        ) top3;

        transformation := greatest(0, round(
          progress * 200
          + waist_lost * 40
          + case
              when member.start_e1rm is not null
                and current_e1rm is not null
                and current_e1rm >= member.start_e1rm
              then 150 else 0
            end
        ))::int;

        insert into public.league_scores (
          season_id, user_id, week_index,
          consistency_pts, transformation_pts, sessions, goal_progress_pct, computed_at
        )
        values (
          season.id, member.user_id, week_idx,
          consistency, transformation, sessions_count, round(progress, 2), now()
        )
        on conflict (season_id, user_id, week_index) do update set
          consistency_pts = excluded.consistency_pts,
          transformation_pts = excluded.transformation_pts,
          sessions = excluded.sessions,
          goal_progress_pct = excluded.goal_progress_pct,
          computed_at = now();

        week_idx := week_idx + 1;
        week_from := week_to;
      end loop;

      -- Badges awarded by the same pass.
      insert into public.badges (user_id, season_id, slug)
      select member.user_id, season.id, 'iron_waist'
      where member.start_waist_cm is not null
        and exists (
          select 1 from public.body_metrics bm
          where bm.user_id = member.user_id
            and bm.waist_cm is not null
            and member.start_waist_cm - bm.waist_cm >= 5
        )
      on conflict do nothing;

      insert into public.badges (user_id, season_id, slug)
      select member.user_id, season.id, 'volume_king'
      where exists (
        select 1
        from public.set_logs sl
        join public.workout_sessions ws on ws.id = sl.session_id
        where ws.user_id = member.user_id and sl.is_complete
        group by date_trunc('week', ws.started_at)
        having sum(sl.weight_kg * sl.reps) >= 50000
      )
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

revoke all on function public.recompute_league_scores() from public;

-- Nightly at 03:15 UTC. pg_cron may need enabling once in the dashboard:
--   Database → Extensions → pg_cron.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule('jlika-league-nightly')
    where exists (select 1 from cron.job where jobname = 'jlika-league-nightly');
    perform cron.schedule(
      'jlika-league-nightly',
      '15 3 * * *',
      $cron$select public.recompute_league_scores();$cron$
    );
  else
    raise notice 'pg_cron is not available; call recompute_league_scores() from your own scheduler.';
  end if;
end
$$;
