-- JLIKA Gym — rejoining a coach you removed starts from the defaults.
--
-- Reactivating an ended link used to keep whatever was shared when it ended.
-- So an athlete who had opened up progress photos, then ended the coaching,
-- handed the photos straight back the moment they used a code again — without
-- being told. Joining is joining: an ended link returns at training-only.
--
-- A link that is merely active or paused keeps its settings, which is the
-- original point: redeeming a code twice must not turn share_training back on
-- for someone who deliberately switched it off.

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

  -- The constraint is named rather than inferred from columns: a bare
  -- `coach_id` in an inference list collides with this function's OUT
  -- parameter of the same name and Postgres refuses the call (42702).
  insert into public.coach_links (coach_id, athlete_id)
  values (invite.coach_id, caller)
  on conflict on constraint coach_links_pkey do update
  set status = 'active',
      share_training = case
        when public.coach_links.status = 'ended' then true
        else public.coach_links.share_training end,
      share_body_metrics = case
        when public.coach_links.status = 'ended' then false
        else public.coach_links.share_body_metrics end,
      share_photos = case
        when public.coach_links.status = 'ended' then false
        else public.coach_links.share_photos end,
      share_nutrition = case
        when public.coach_links.status = 'ended' then false
        else public.coach_links.share_nutrition end;

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
