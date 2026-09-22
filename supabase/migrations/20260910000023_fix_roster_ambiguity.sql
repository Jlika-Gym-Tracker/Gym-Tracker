-- JLIKA Gym — the coach dashboard could not load.
--
-- coach_roster declared a local variable `week_start`, and the query it builds
-- joins program_weeks, which has a column of that name. plpgsql substitutes
-- bare identifiers, so `w.week_start = week_start` was ambiguous and Postgres
-- refused the call with 42702 — for every coach, roster or no roster. The
-- dashboard rendered its error card instead.
--
-- Renaming the variable to something no table has fixes it. Nothing about the
-- returned shape changes.

create or replace function public.coach_roster()
returns table (
  athlete_id uuid,
  display_name text,
  avatar_url text,
  goal text,
  sessions_this_week int,
  planned_this_week int,
  sets_this_week int,
  last_session_at timestamptz,
  week_dots int[],
  shares_body boolean,
  shares_photos boolean,
  shares_nutrition boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  -- Deliberately not `week_start`: that is a program_weeks column, and a bare
  -- reference to it inside the query below cannot be resolved.
  monday date := (date_trunc('week', now() at time zone 'utc'))::date;
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;

  return query
  select
    a.id,
    p.display_name,
    p.avatar_url,
    p.goal,
    coalesce(s.done, 0)::int,
    coalesce(pl.planned, 0)::int,
    coalesce(s.sets, 0)::int,
    s.last_at,
    coalesce(s.dots, '{}'::int[]),
    cl.share_body_metrics,
    cl.share_photos,
    cl.share_nutrition
  from public.coach_links cl
  join auth.users a on a.id = cl.athlete_id
  join public.profiles p on p.id = cl.athlete_id
  left join lateral (
    select
      count(distinct ws.id)::int as done,
      count(sl.id) filter (where sl.is_complete)::int as sets,
      max(ws.started_at) as last_at,
      array_agg(distinct extract(isodow from ws.started_at)::int - 1) as dots
    from public.workout_sessions ws
    left join public.set_logs sl on sl.session_id = ws.id
    where ws.user_id = cl.athlete_id
      and ws.ended_at is not null
      and ws.started_at >= monday
  ) s on true
  left join lateral (
    select count(*)::int as planned
    from public.program_days d
    join public.program_weeks w on w.id = d.week_id
    where w.user_id = cl.athlete_id
      and w.week_start = monday
      and not d.is_rest
      and exists (select 1 from public.program_exercises pe where pe.day_id = d.id)
  ) pl on true
  where cl.coach_id = caller
    and cl.status = 'active'
    and cl.share_training
  order by p.display_name;
end;
$$;

revoke all on function public.coach_roster() from public;
revoke all on function public.coach_roster() from anon;
grant execute on function public.coach_roster() to authenticated;
