-- JLIKA Gym — Phase 7: the crew league.
--
-- Only percentages and points ever cross between members. Standings come from
-- league_scores, which a nightly job computes from each member's own rows;
-- league_standings() is SECURITY DEFINER and returns aggregates only.
--
-- Every table is created first, then every policy. Several policies reference
-- league_members, so defining them inline would fail on the tables declared
-- before it.

-- ------------------------------------------------------------------ tables

create table if not exists public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  crew_owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  constraint league_seasons_dates check (ends_on > starts_on)
);

create table if not exists public.league_members (
  season_id uuid not null references public.league_seasons on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  -- Baseline snapshot taken when they join; everything is measured against it.
  start_weight_kg numeric(5,2),
  start_waist_cm numeric(5,1),
  start_e1rm numeric(7,2),
  joined_at timestamptz not null default now(),
  primary key (season_id, user_id)
);

create table if not exists public.league_scores (
  season_id uuid not null references public.league_seasons on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  week_index int not null check (week_index >= 0),
  consistency_pts int not null default 0,
  transformation_pts int not null default 0,
  sessions int not null default 0,
  goal_progress_pct numeric(5,2),
  computed_at timestamptz not null default now(),
  primary key (season_id, user_id, week_index)
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.league_seasons on delete cascade,
  creator_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('crew','head_to_head','personal')),
  metric text not null check (metric in (
    'sessions','sets','waist_pct','weight_pct','protein_days','streak'
  )),
  title text not null,
  target numeric,
  stakes text,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'pending'
    check (status in ('pending','live','finished','declined')),
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  accepted boolean not null default false,
  progress numeric not null default 0,
  primary key (challenge_id, user_id)
);

create table if not exists public.badges (
  user_id uuid not null references auth.users on delete cascade,
  season_id uuid references public.league_seasons on delete cascade,
  slug text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, season_id, slug)
);

-- ---------------------------------------------------------------- predicates
--
-- Membership tests live in SECURITY DEFINER functions, not inline in the
-- policies. A policy on league_members that selects from league_members
-- recurses (Postgres 42P17), as does any pair of policies that read each
-- other's tables. Running the lookup as the owner sidesteps RLS re-entry.
-- Each function reads auth.uid() itself rather than taking it as an argument,
-- so it can only ever answer about the caller.

create or replace function public.is_league_member(target_season uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m
    where m.season_id = target_season and m.user_id = auth.uid()
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
    select 1 from public.challenge_participants cp
    where cp.challenge_id = target_challenge and cp.user_id = auth.uid()
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
    select 1 from public.challenges c
    where c.id = target_challenge and c.creator_id = auth.uid()
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
revoke all on function public.is_challenge_participant(uuid) from public;
revoke all on function public.is_challenge_creator(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.is_challenge_participant(uuid) to authenticated;
grant execute on function public.is_challenge_creator(uuid) to authenticated;

-- ----------------------------------------------------------------- policies

alter table public.league_seasons enable row level security;
alter table public.league_members enable row level security;
alter table public.league_scores enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.badges enable row level security;

-- Readable by anyone in the season; writable only by the person who made it.
drop policy if exists "league_seasons: members read" on public.league_seasons;
create policy "league_seasons: members read"
  on public.league_seasons for select
  using (
    crew_owner_id = (select auth.uid())
    or public.is_league_member(id)
  );

drop policy if exists "league_seasons: owner writes" on public.league_seasons;
create policy "league_seasons: owner writes"
  on public.league_seasons for all
  using (crew_owner_id = (select auth.uid()))
  with check (crew_owner_id = (select auth.uid()));

-- A member can see who else is in their season, but the baselines are only
-- ever read by the scoring job, never surfaced to another member.
drop policy if exists "league_members: co-members read" on public.league_members;
create policy "league_members: co-members read"
  on public.league_members for select
  using (
    user_id = (select auth.uid())
    or public.is_league_member(season_id)
  );

drop policy if exists "league_members: manage own" on public.league_members;
create policy "league_members: manage own"
  on public.league_members for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "league_scores: co-members read" on public.league_scores;
create policy "league_scores: co-members read"
  on public.league_scores for select
  using (public.is_league_member(season_id));

-- A personal challenge is visible only to its creator, whatever the season.
drop policy if exists "challenges: participants read" on public.challenges;
create policy "challenges: participants read"
  on public.challenges for select
  using (
    creator_id = (select auth.uid())
    or (kind <> 'personal' and public.is_challenge_participant(id))
  );

drop policy if exists "challenges: creator writes" on public.challenges;
create policy "challenges: creator writes"
  on public.challenges for all
  using (creator_id = (select auth.uid()))
  with check (creator_id = (select auth.uid()));

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

drop policy if exists "badges: co-members read" on public.badges;
create policy "badges: co-members read"
  on public.badges for select
  using (
    user_id = (select auth.uid())
    or public.is_league_member(season_id)
  );
