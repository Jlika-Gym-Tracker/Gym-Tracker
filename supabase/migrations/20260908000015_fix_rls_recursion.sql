-- JLIKA Gym — break two RLS recursion cycles (Postgres 42P17).
--
-- "league_members: co-members read" selected from league_members, so evaluating
-- it required evaluating itself. "challenges: participants read" and
-- "challenge_participants: read own challenges" each read the other's table,
-- which is the same fault one step removed. Both made the league page fail
-- outright with infinite_recursion.
--
-- The fix is the standard one: move the membership test into a SECURITY DEFINER
-- function. It runs as the owner, so the lookup inside it does not re-enter RLS,
-- and the policy becomes a plain boolean call. Each function still answers only
-- about the caller — auth.uid() is read inside, never passed in — so this widens
-- nothing.

create or replace function public.is_league_member(target_season uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members m
    where m.season_id = target_season
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_challenge_participant(target_challenge uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.challenge_participants cp
    where cp.challenge_id = target_challenge
      and cp.user_id = auth.uid()
  );
$$;

create or replace function public.is_challenge_creator(target_challenge uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.challenges c
    where c.id = target_challenge
      and c.creator_id = auth.uid()
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
revoke all on function public.is_challenge_participant(uuid) from public;
revoke all on function public.is_challenge_creator(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.is_challenge_participant(uuid) to authenticated;
grant execute on function public.is_challenge_creator(uuid) to authenticated;

-- ----------------------------------------------------------------- rewrites

drop policy if exists "league_members: co-members read" on public.league_members;
create policy "league_members: co-members read"
  on public.league_members for select
  using (
    user_id = (select auth.uid())
    or public.is_league_member(season_id)
  );

drop policy if exists "league_scores: co-members read" on public.league_scores;
create policy "league_scores: co-members read"
  on public.league_scores for select
  using (public.is_league_member(season_id));

drop policy if exists "league_seasons: members read" on public.league_seasons;
create policy "league_seasons: members read"
  on public.league_seasons for select
  using (
    crew_owner_id = (select auth.uid())
    or public.is_league_member(id)
  );

drop policy if exists "badges: co-members read" on public.badges;
create policy "badges: co-members read"
  on public.badges for select
  using (
    user_id = (select auth.uid())
    or public.is_league_member(season_id)
  );

drop policy if exists "challenges: participants read" on public.challenges;
create policy "challenges: participants read"
  on public.challenges for select
  using (
    creator_id = (select auth.uid())
    -- A personal challenge stays private to its creator, whatever the season.
    or (kind <> 'personal' and public.is_challenge_participant(id))
  );

drop policy if exists "challenge_participants: read own challenges" on public.challenge_participants;
create policy "challenge_participants: read own challenges"
  on public.challenge_participants for select
  using (
    user_id = (select auth.uid())
    or public.is_challenge_creator(challenge_id)
  );

drop policy if exists "challenge_participants: manage own" on public.challenge_participants;
create policy "challenge_participants: manage own"
  on public.challenge_participants for all
  using (
    user_id = (select auth.uid())
    or public.is_challenge_creator(challenge_id)
  )
  with check (
    user_id = (select auth.uid())
    or public.is_challenge_creator(challenge_id)
  );
