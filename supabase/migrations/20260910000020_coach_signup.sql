-- JLIKA Gym — the coach's front door.
--
-- Two things are needed for a coach to sign up as a coach rather than as an
-- athlete who later finds a switch:
--   1. somewhere to put the gym or team they coach under, and
--   2. a way for an invited athlete to see who is inviting them before they
--      hand over any training data.

alter table public.profiles
  add column if not exists gym_name text;

comment on column public.profiles.gym_name is
  'Optional gym or team a coach works under. Shown to athletes on the join screen.';

/**
 * What an athlete is shown before joining a coach.
 *
 * SECURITY DEFINER because coach_invites is deliberately unreadable — the code
 * is the credential. Granted to `authenticated` only, never `anon`: an
 * anonymous caller who could test codes would have an oracle for enumerating
 * valid ones, and the reply names a real person.
 *
 * `reason` is 'ok' when the code can be redeemed. Every other value returns no
 * coach identity at all, so an unusable code reveals nothing about who wrote it.
 */
create or replace function public.coach_invite_preview(invite_code text)
returns table (
  coach_id uuid,
  coach_name text,
  avatar_url text,
  gym_name text,
  reason text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  invite public.coach_invites%rowtype;
  verdict text;
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;

  select * into invite
  from public.coach_invites
  where code = upper(trim(invite_code));

  if not found then
    return query select null::uuid, null::text, null::text, null::text, 'unknown'::text;
    return;
  end if;

  verdict := case
    when invite.expires_at < now() then 'expired'
    when invite.uses_left <= 0 then 'used_up'
    when invite.coach_id = caller then 'self'
    when exists (
      select 1 from public.coach_links cl
      where cl.coach_id = invite.coach_id
        and cl.athlete_id = caller
        and cl.status = 'active'
    ) then 'already'
    else 'ok'
  end;

  -- Identity is only disclosed for a code that would actually work.
  if verdict not in ('ok', 'already') then
    return query select null::uuid, null::text, null::text, null::text, verdict;
    return;
  end if;

  return query
  select p.id, p.display_name, p.avatar_url, p.gym_name, verdict
  from public.profiles p
  where p.id = invite.coach_id;
end;
$$;

revoke all on function public.coach_invite_preview(text) from public;
revoke all on function public.coach_invite_preview(text) from anon;
grant execute on function public.coach_invite_preview(text) to authenticated;
