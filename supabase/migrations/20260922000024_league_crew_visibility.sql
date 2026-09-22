-- JLIKA Gym — you could not invite anyone to a league, and a stranger could
-- walk into one.
--
-- Two halves of the same mistake. league_seasons was readable only by its
-- owner or by someone already a member, so a crew mate saw no seasons at all
-- and the "Join the season?" screen could never render for them — the only
-- people who could join were the ones already in. Meanwhile league_members
-- allowed any signed-in user to insert their own row into *any* season, so
-- anyone who learned a season's id could join it and read the standings:
-- every member's name, sessions and body-progress percentage.
--
-- A season belongs to a crew, so crew membership is what decides both.

/**
 * Is the caller in `other`'s crew?
 *
 * SECURITY DEFINER because it is called from policies on other tables, where
 * crew_links' own policy would not apply to the row being checked. Links are
 * written in both directions by redeem_crew_invite, so one direction is enough.
 */
create or replace function public.shares_crew_with(other uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.crew_links cl
    where cl.user_id = other
      and cl.friend_id = auth.uid()
  );
$$;

/**
 * The crew that owns a season.
 *
 * Needed by the league_members policy below, which cannot simply select from
 * league_seasons: that table's own policy calls is_league_member, which reads
 * league_members, which is the table being filtered — 42P17 recursion.
 */
create or replace function public.season_crew_owner(target_season uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select crew_owner_id from public.league_seasons where id = target_season;
$$;

revoke all on function public.shares_crew_with(uuid) from public;
revoke all on function public.shares_crew_with(uuid) from anon;
grant execute on function public.shares_crew_with(uuid) to authenticated;
revoke all on function public.season_crew_owner(uuid) from public;
revoke all on function public.season_crew_owner(uuid) from anon;
grant execute on function public.season_crew_owner(uuid) to authenticated;

-- A crew mate can now see the season, which is what makes joining possible.
drop policy if exists "league_seasons: members read" on public.league_seasons;
drop policy if exists "league_seasons: crew and members read" on public.league_seasons;
create policy "league_seasons: crew and members read"
  on public.league_seasons for select
  using (
    crew_owner_id = (select auth.uid())
    or public.is_league_member(id)
    or public.shares_crew_with(crew_owner_id)
  );

-- Splitting the old FOR ALL policy: reading, leaving and updating your own row
-- stay as they were, but joining now has to pass the crew check.
drop policy if exists "league_members: manage own" on public.league_members;

drop policy if exists "league_members: join a crew season" on public.league_members;
create policy "league_members: join a crew season"
  on public.league_members for insert
  with check (
    user_id = (select auth.uid())
    and (
      public.season_crew_owner(season_id) = (select auth.uid())
      or public.shares_crew_with(public.season_crew_owner(season_id))
    )
  );

drop policy if exists "league_members: update own" on public.league_members;
create policy "league_members: update own"
  on public.league_members for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "league_members: leave own" on public.league_members;
create policy "league_members: leave own"
  on public.league_members for delete
  using (user_id = (select auth.uid()));
