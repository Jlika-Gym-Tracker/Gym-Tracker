-- JLIKA Gym — Phase 1: profiles.
-- Every row in this app is owned by exactly one user and is invisible to everyone else.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  sex text check (sex in ('male','female','other')),
  birth_date date,
  height_cm numeric(5,1),
  unit_system text not null default 'metric' check (unit_system in ('metric','imperial')),
  goal text not null default 'cut' check (goal in ('cut','bulk','recomp','strength','health')),
  activity_factor numeric(3,2) not null default 1.45,
  calorie_target int,
  protein_target_g int,
  carb_target_g int,
  fat_target_g int,
  training_day_kcal_bonus int not null default 250,
  -- Null until the 5-step onboarding is finished; lets onboarding resume where it stopped.
  onboarded_at timestamptz,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are self-readable" on public.profiles;
create policy "profiles are self-readable"
  on public.profiles for select
  using (id = (select auth.uid()));

drop policy if exists "profiles are self-insertable" on public.profiles;
create policy "profiles are self-insertable"
  on public.profiles for insert
  with check (id = (select auth.uid()));

drop policy if exists "profiles are self-updatable" on public.profiles;
create policy "profiles are self-updatable"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Deliberately no delete policy: profiles die with the auth user via the FK cascade.

-- A profile row must exist the moment a user is created, whichever way they signed
-- up (password, magic link or Google), so no screen has to cope with a missing row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
