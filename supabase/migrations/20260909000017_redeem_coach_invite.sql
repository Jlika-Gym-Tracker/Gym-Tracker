-- JLIKA Gym — redeeming a coach invite.
--
-- SECURITY DEFINER because the athlete cannot read coach_invites; the code is
-- the credential, so it must not be enumerable. The link is created with the
-- default sharing: training on, body/photos/nutrition off.

create or replace function public.redeem_coach_invite(invite_code text)
returns table (coach_id uuid, coach_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  invite public.coach_invites%rowtype;
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;

  select * into invite
  from public.coach_invites
  where code = upper(trim(invite_code))
  for update;

  if not found then
    raise exception 'That coach code does not exist';
  end if;
  if invite.expires_at < now() then
    raise exception 'That coach code has expired';
  end if;
  if invite.uses_left <= 0 then
    raise exception 'That coach code has been used up';
  end if;
  if invite.coach_id = caller then
    raise exception 'You cannot coach yourself';
  end if;

  -- Re-joining an existing link must not silently re-widen what is shared, so
  -- an existing row is only reactivated, never reset to defaults.
  insert into public.coach_links (coach_id, athlete_id)
  values (invite.coach_id, caller)
  on conflict (coach_id, athlete_id) do update set status = 'active';

  update public.coach_invites
  set uses_left = uses_left - 1
  where code = invite.code;

  return query
  select p.id, p.display_name
  from public.profiles p
  where p.id = invite.coach_id;
end;
$$;

revoke all on function public.redeem_coach_invite(text) from public;
grant execute on function public.redeem_coach_invite(text) to authenticated;

/**
 * A coach's roster with the compliance numbers the dashboard needs.
 *
 * SECURITY DEFINER so it can read each athlete's sessions, but it returns only
 * counts — never loads, weights or anything the athlete did not share. Rows
 * appear only for links that are active and sharing training.
 */
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
  week_start date := (date_trunc('week', now() at time zone 'utc'))::date;
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
      and ws.started_at >= week_start
  ) s on true
  left join lateral (
    select count(*)::int as planned
    from public.program_days d
    join public.program_weeks w on w.id = d.week_id
    where w.user_id = cl.athlete_id
      and w.week_start = week_start
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
grant execute on function public.coach_roster() to authenticated;
