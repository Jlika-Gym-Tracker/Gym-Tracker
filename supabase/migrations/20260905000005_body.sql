-- JLIKA Gym — Phase 4: body metrics and progress photos.
-- Photos are private. The bucket is not public and the app hands out short-lived
-- signed URLs generated server-side; there is no second PIN on top.

create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  -- A date, never a timestamp: a weigh-in belongs to a day, not an instant.
  measured_on date not null,
  weight_kg numeric(5,2) check (weight_kg > 0 and weight_kg < 400),
  waist_cm numeric(5,1) check (waist_cm > 0),
  chest_cm numeric(5,1) check (chest_cm > 0),
  arm_cm numeric(5,1) check (arm_cm > 0),
  thigh_cm numeric(5,1) check (thigh_cm > 0),
  hip_cm numeric(5,1) check (hip_cm > 0),
  bodyfat_pct numeric(4,1) check (bodyfat_pct > 0 and bodyfat_pct < 80),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create index if not exists body_metrics_user_date_idx
  on public.body_metrics (user_id, measured_on desc);

alter table public.body_metrics enable row level security;

drop policy if exists "body_metrics: own rows" on public.body_metrics;
create policy "body_metrics: own rows"
  on public.body_metrics for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  taken_on date not null,
  pose text not null check (pose in ('front','side','back')),
  -- Always {user_id}/{uuid}.webp — the storage policy keys on the first segment.
  storage_path text not null unique,
  weight_kg numeric(5,2),
  created_at timestamptz not null default now()
);

create index if not exists progress_photos_user_date_idx
  on public.progress_photos (user_id, taken_on desc);

alter table public.progress_photos enable row level security;

drop policy if exists "progress_photos: own rows" on public.progress_photos;
create policy "progress_photos: own rows"
  on public.progress_photos for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------------ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 8388608, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/webp','image/jpeg','image/png'];

-- Each person can only touch objects under a folder named after their own uid.
drop policy if exists "progress photos are private to their owner" on storage.objects;
create policy "progress photos are private to their owner"
  on storage.objects for all
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
