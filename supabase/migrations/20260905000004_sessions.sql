-- JLIKA Gym — Phase 3: workout sessions and set logs.
-- Logged sets keep the load and reps as performed. Editing or republishing a
-- program never rewrites them, which is why set_logs carries its own
-- exercise_id rather than pointing at a program_exercises row.

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  -- Null when the program day is later deleted; the session survives.
  day_id uuid references public.program_days on delete set null,
  title text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  bodyweight_kg numeric(5,2),
  notes text
);

create index if not exists workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

-- At most one session in progress per person, so "resume" is never ambiguous.
create unique index if not exists workout_sessions_one_active_idx
  on public.workout_sessions (user_id) where ended_at is null;

alter table public.workout_sessions enable row level security;

drop policy if exists "workout_sessions: own rows" on public.workout_sessions;
create policy "workout_sessions: own rows"
  on public.workout_sessions for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions on delete cascade,
  exercise_id uuid not null references public.exercises,
  set_index int not null check (set_index >= 0),
  weight_kg numeric(6,2) check (weight_kg >= 0),
  reps int check (reps >= 0),
  rpe numeric(3,1) check (rpe >= 1 and rpe <= 10),
  is_complete boolean not null default false,
  logged_at timestamptz not null default now(),
  unique (session_id, exercise_id, set_index)
);

create index if not exists set_logs_session_idx on public.set_logs (session_id);
-- Drives "your history" and the progression hint for one movement.
create index if not exists set_logs_exercise_idx
  on public.set_logs (exercise_id, logged_at desc) where is_complete;

alter table public.set_logs enable row level security;

drop policy if exists "set_logs: through session" on public.set_logs;
create policy "set_logs: through session"
  on public.set_logs for all
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workout_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));
