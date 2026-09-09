-- JLIKA Gym — coaching.
--
-- The app's premise is that every row belongs to one person and nobody else can
-- read it. A coach is the first deliberate exception, so it is built to be
-- narrow, athlete-controlled and revocable:
--
--   * The athlete opts in per category. Training is on by default; bodyweight,
--     photos and nutrition are off until the athlete turns them on.
--   * Access is checked in one SECURITY DEFINER function, so there is exactly
--     one place that decides what a coach may see.
--   * Ending the link revokes everything immediately — nothing is copied to the
--     coach's side except programs the coach wrote themselves.

alter table public.profiles
  add column if not exists coaching_enabled boolean not null default false;

comment on column public.profiles.coaching_enabled is
  'True when this account also acts as a coach. Coaching is a capability on a normal account, not a separate kind of user.';

-- ------------------------------------------------------------------- links

create table if not exists public.coach_invites (
  code text primary key,
  coach_id uuid not null references auth.users on delete cascade,
  label text,
  uses_left int not null default 10 check (uses_left >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_invites_coach_idx on public.coach_invites (coach_id);

create table if not exists public.coach_links (
  coach_id uuid not null references auth.users on delete cascade,
  athlete_id uuid not null references auth.users on delete cascade,
  status text not null default 'active' check (status in ('active','paused','ended')),
  -- Athlete-controlled. Training on, everything else off until they say so.
  share_training boolean not null default true,
  share_body_metrics boolean not null default false,
  share_photos boolean not null default false,
  share_nutrition boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id),
  constraint coach_links_no_self check (coach_id <> athlete_id)
);

create index if not exists coach_links_athlete_idx on public.coach_links (athlete_id);

-- ------------------------------------------------------------ coach programs

create table if not exists public.coach_programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.coach_programs on delete cascade,
  day_index int not null check (day_index between 0 and 6),
  name text not null,
  focus_note text,
  is_rest boolean not null default false,
  unique (program_id, day_index)
);

create table if not exists public.coach_program_exercises (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.coach_program_days on delete cascade,
  exercise_id uuid not null references public.exercises,
  position int not null,
  target_sets int not null check (target_sets between 1 and 20),
  rep_min int, rep_max int,
  per_side boolean not null default false,
  note text,
  target_weight_kg numeric(6,2)
);

create index if not exists coach_program_exercises_day_idx
  on public.coach_program_exercises (day_id, position);

-- A week the athlete did not write themselves is marked, so the program screen
-- can say where it came from instead of pretending they wrote it.
alter table public.program_weeks
  add column if not exists assigned_by_coach_id uuid references auth.users on delete set null;

-- --------------------------------------------------------------- predicates

/**
 * The single place that decides what a coach may read.
 *
 * SECURITY DEFINER so the lookup does not re-enter RLS (see the league
 * migration for what that costs). auth.uid() is read inside, so it can only
 * ever answer "may *I* read this athlete's <scope>".
 */
create or replace function public.coach_can_read(athlete uuid, scope text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_links cl
    where cl.coach_id = auth.uid()
      and cl.athlete_id = athlete
      and cl.status = 'active'
      and case scope
        when 'training'  then cl.share_training
        when 'body'      then cl.share_body_metrics
        when 'photos'    then cl.share_photos
        when 'nutrition' then cl.share_nutrition
        else false
      end
  );
$$;

revoke all on function public.coach_can_read(uuid, text) from public;
grant execute on function public.coach_can_read(uuid, text) to authenticated;

/** Owner of a program week, for the child-table policies. */
create or replace function public.program_week_owner(week uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select w.user_id from public.program_weeks w where w.id = week;
$$;

create or replace function public.program_day_owner(day uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select w.user_id
  from public.program_days d
  join public.program_weeks w on w.id = d.week_id
  where d.id = day;
$$;

create or replace function public.session_owner(session uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select s.user_id from public.workout_sessions s where s.id = session;
$$;

revoke all on function public.program_week_owner(uuid) from public;
revoke all on function public.program_day_owner(uuid) from public;
revoke all on function public.session_owner(uuid) from public;
grant execute on function public.program_week_owner(uuid) to authenticated;
grant execute on function public.program_day_owner(uuid) to authenticated;
grant execute on function public.session_owner(uuid) to authenticated;

-- ------------------------------------------------------------------ policies

alter table public.coach_invites enable row level security;
alter table public.coach_links enable row level security;
alter table public.coach_programs enable row level security;
alter table public.coach_program_days enable row level security;
alter table public.coach_program_exercises enable row level security;

drop policy if exists "coach_invites: own rows" on public.coach_invites;
create policy "coach_invites: own rows"
  on public.coach_invites for all
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

-- Both sides can see the link. Only the athlete may change what it shares;
-- either side may end it.
drop policy if exists "coach_links: both sides read" on public.coach_links;
create policy "coach_links: both sides read"
  on public.coach_links for select
  using (coach_id = (select auth.uid()) or athlete_id = (select auth.uid()));

drop policy if exists "coach_links: athlete controls" on public.coach_links;
create policy "coach_links: athlete controls"
  on public.coach_links for update
  using (athlete_id = (select auth.uid()))
  with check (athlete_id = (select auth.uid()));

drop policy if exists "coach_links: either side ends it" on public.coach_links;
create policy "coach_links: either side ends it"
  on public.coach_links for delete
  using (coach_id = (select auth.uid()) or athlete_id = (select auth.uid()));

drop policy if exists "coach_programs: own rows" on public.coach_programs;
create policy "coach_programs: own rows"
  on public.coach_programs for all
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

drop policy if exists "coach_program_days: through program" on public.coach_program_days;
create policy "coach_program_days: through program"
  on public.coach_program_days for all
  using (exists (
    select 1 from public.coach_programs p
    where p.id = program_id and p.coach_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.coach_programs p
    where p.id = program_id and p.coach_id = (select auth.uid())
  ));

drop policy if exists "coach_program_exercises: through day" on public.coach_program_exercises;
create policy "coach_program_exercises: through day"
  on public.coach_program_exercises for all
  using (exists (
    select 1 from public.coach_program_days d
    join public.coach_programs p on p.id = d.program_id
    where d.id = day_id and p.coach_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.coach_program_days d
    join public.coach_programs p on p.id = d.program_id
    where d.id = day_id and p.coach_id = (select auth.uid())
  ));

-- ------------------------------------------- coach read access to athletes

drop policy if exists "program_weeks: coach reads" on public.program_weeks;
create policy "program_weeks: coach reads"
  on public.program_weeks for select
  using (public.coach_can_read(user_id, 'training'));

drop policy if exists "program_days: coach reads" on public.program_days;
create policy "program_days: coach reads"
  on public.program_days for select
  using (public.coach_can_read(public.program_week_owner(week_id), 'training'));

drop policy if exists "program_exercises: coach reads" on public.program_exercises;
create policy "program_exercises: coach reads"
  on public.program_exercises for select
  using (public.coach_can_read(public.program_day_owner(day_id), 'training'));

drop policy if exists "workout_sessions: coach reads" on public.workout_sessions;
create policy "workout_sessions: coach reads"
  on public.workout_sessions for select
  using (public.coach_can_read(user_id, 'training'));

drop policy if exists "set_logs: coach reads" on public.set_logs;
create policy "set_logs: coach reads"
  on public.set_logs for select
  using (public.coach_can_read(public.session_owner(session_id), 'training'));

drop policy if exists "body_metrics: coach reads" on public.body_metrics;
create policy "body_metrics: coach reads"
  on public.body_metrics for select
  using (public.coach_can_read(user_id, 'body'));

drop policy if exists "progress_photos: coach reads" on public.progress_photos;
create policy "progress_photos: coach reads"
  on public.progress_photos for select
  using (public.coach_can_read(user_id, 'photos'));

-- A coach may write a week for an athlete they coach — that is the point.
drop policy if exists "program_weeks: coach assigns" on public.program_weeks;
create policy "program_weeks: coach assigns"
  on public.program_weeks for insert
  with check (public.coach_can_read(user_id, 'training'));

drop policy if exists "program_days: coach assigns" on public.program_days;
create policy "program_days: coach assigns"
  on public.program_days for insert
  with check (public.coach_can_read(public.program_week_owner(week_id), 'training'));

drop policy if exists "program_exercises: coach assigns" on public.program_exercises;
create policy "program_exercises: coach assigns"
  on public.program_exercises for insert
  with check (public.coach_can_read(public.program_day_owner(day_id), 'training'));

-- Signed URLs are minted with the caller's own token, so a coach needs storage
-- read on the athlete's folder for shared photos to resolve at all.
drop policy if exists "coaches read shared progress photos" on storage.objects;
create policy "coaches read shared progress photos"
  on storage.objects for select
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.coach_can_read(((storage.foldername(name))[1])::uuid, 'photos')
  );
