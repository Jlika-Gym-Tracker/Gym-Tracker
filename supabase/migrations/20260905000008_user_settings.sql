-- JLIKA Gym — user settings.
-- Created here because the nutrition targets read from it; the settings screen
-- that writes to it arrives in Phase 6.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  training_days int[] not null default '{0,1,3,4}',   -- 0 = Monday
  default_rest_seconds int not null default 90 check (default_rest_seconds between 15 and 600),
  auto_rest boolean not null default true,
  keyboard_shortcuts boolean not null default true,
  show_e1rm boolean not null default false,
  deficit_kcal int not null default 400 check (deficit_kcal between 0 and 1200),
  protein_g_per_kg numeric(3,1) not null default 2.4 check (protein_g_per_kg between 1.0 and 4.0),
  fat_pct numeric(3,2) not null default 0.28 check (fat_pct between 0.15 and 0.60),
  refeed_day int check (refeed_day between 0 and 6),  -- null = none
  auto_adjust boolean not null default true,
  ask_before_adjust boolean not null default true,
  blur_thumbnails boolean not null default false,
  strip_exif boolean not null default true,
  notify_weighin boolean not null default true,
  notify_unpublished_week boolean not null default true,
  meals_per_day int not null default 4 check (meals_per_day between 3 and 5)
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings: own row" on public.user_settings;
create policy "user_settings: own row"
  on public.user_settings for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Give every account a settings row up front, so no screen has to cope with
-- its absence. Extends the Phase 1 trigger rather than replacing it.
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

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;
