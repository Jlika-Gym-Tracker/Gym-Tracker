-- JLIKA Gym — redeem_coach_invite could never actually run.
--
-- The function declares OUT parameters (coach_id, coach_name) via RETURNS
-- TABLE, and plpgsql substitutes those names anywhere they appear bare. In
--
--     on conflict (coach_id, athlete_id) do update ...
--
-- `coach_id` therefore resolved to the OUT parameter as readily as to the
-- column, and Postgres refused the whole call with 42702, "column reference
-- coach_id is ambiguous". Every athlete trying to join a coach hit it.
--
-- Naming the constraint instead of inferring from columns removes the bare
-- reference, and keeps the returned column names the app already reads.

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
  on conflict on constraint coach_links_pkey do update set status = 'active';

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
revoke all on function public.redeem_coach_invite(text) from anon;
grant execute on function public.redeem_coach_invite(text) to authenticated;
