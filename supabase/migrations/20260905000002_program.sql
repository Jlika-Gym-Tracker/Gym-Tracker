-- JLIKA Gym — Phase 2: exercise library and the weekly program.
-- A week is a mutable draft until it is published; logged sets (Phase 3) keep
-- what was actually performed, so editing a program never rewrites history.

-- ---------------------------------------------------------------- exercises

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  -- Null = global seed row, readable by everyone. Non-null = someone's own movement.
  owner_id uuid references auth.users on delete cascade,
  slug text unique not null,
  name text not null,
  primary_muscle text not null check (primary_muscle in (
    'chest','lats','middle_back','lower_back','traps','shoulders','biceps',
    'triceps','forearms','quadriceps','hamstrings','glutes','calves',
    'abdominals','abductors','adductors','neck'
  )),
  secondary_muscles text[] not null default '{}',
  equipment text not null check (equipment in (
    'barbell','dumbbell','machine','cable','body_only','bands','kettlebells',
    'ez_curl_bar','exercise_ball','medicine_ball','foam_roll','other'
  )),
  -- Alternate spellings the paste parser matches against, so "Hamstring Curl"
  -- finds "Lying Leg Curls" without a trip through the review step.
  aliases text[] not null default '{}',
  video_url text,
  image_start_url text,
  image_end_url text,
  cues text[] not null default '{}',
  how_to text[] not null default '{}',
  common_mistake text,
  created_at timestamptz not null default now()
);

create index if not exists exercises_primary_muscle_idx on public.exercises (primary_muscle);
create index if not exists exercises_owner_idx on public.exercises (owner_id);

alter table public.exercises enable row level security;

drop policy if exists "exercises: read global or own" on public.exercises;
create policy "exercises: read global or own"
  on public.exercises for select
  using (owner_id is null or owner_id = (select auth.uid()));

drop policy if exists "exercises: insert own" on public.exercises;
create policy "exercises: insert own"
  on public.exercises for insert
  with check (owner_id = (select auth.uid()));

drop policy if exists "exercises: update own" on public.exercises;
create policy "exercises: update own"
  on public.exercises for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "exercises: delete own" on public.exercises;
create policy "exercises: delete own"
  on public.exercises for delete
  using (owner_id = (select auth.uid()));

-- ------------------------------------------------------------ program weeks

create table if not exists public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  label text not null,
  week_start date not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists program_weeks_user_start_idx
  on public.program_weeks (user_id, week_start desc);

alter table public.program_weeks enable row level security;

drop policy if exists "program_weeks: own rows" on public.program_weeks;
create policy "program_weeks: own rows"
  on public.program_weeks for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------- program days

create table if not exists public.program_days (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.program_weeks on delete cascade,
  day_index int not null check (day_index between 0 and 6),   -- 0 = Monday
  name text not null,
  focus_note text,
  is_rest boolean not null default false,
  unique (week_id, day_index)
);

alter table public.program_days enable row level security;

-- Child tables check ownership through the parent rather than carrying a
-- duplicate user_id that could drift out of sync.
drop policy if exists "program_days: through week" on public.program_days;
create policy "program_days: through week"
  on public.program_days for all
  using (exists (
    select 1 from public.program_weeks w
    where w.id = week_id and w.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.program_weeks w
    where w.id = week_id and w.user_id = (select auth.uid())
  ));

-- -------------------------------------------------------- program exercises

create table if not exists public.program_exercises (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.program_days on delete cascade,
  exercise_id uuid not null references public.exercises,
  position int not null,
  target_sets int not null check (target_sets between 1 and 20),
  rep_min int check (rep_min > 0),
  rep_max int check (rep_max > 0),
  per_side boolean not null default false,
  note text,
  constraint program_exercises_rep_range check (rep_max is null or rep_min is null or rep_max >= rep_min)
);

create index if not exists program_exercises_day_position_idx
  on public.program_exercises (day_id, position);

alter table public.program_exercises enable row level security;

drop policy if exists "program_exercises: through day" on public.program_exercises;
create policy "program_exercises: through day"
  on public.program_exercises for all
  using (exists (
    select 1 from public.program_days d
    join public.program_weeks w on w.id = d.week_id
    where d.id = day_id and w.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.program_days d
    join public.program_weeks w on w.id = d.week_id
    where d.id = day_id and w.user_id = (select auth.uid())
  ));
