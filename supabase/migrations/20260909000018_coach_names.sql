-- JLIKA Gym — names for the coaches an athlete is linked to.
--
-- profiles is readable only by its owner, so an athlete cannot join to their
-- coach's row to get a name. This returns the display name and avatar for
-- coaches the caller is actually linked to, and nothing else about them.

create or replace function public.coach_names(coach_ids uuid[])
returns table (coach_id uuid, display_name text, avatar_url text)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  where p.id = any(coach_ids)
    and exists (
      select 1 from public.coach_links cl
      where cl.coach_id = p.id and cl.athlete_id = auth.uid()
    );
$$;

revoke all on function public.coach_names(uuid[]) from public;
grant execute on function public.coach_names(uuid[]) to authenticated;
