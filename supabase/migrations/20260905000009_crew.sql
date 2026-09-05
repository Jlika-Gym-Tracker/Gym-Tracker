-- JLIKA Gym — Phase 6: crew links, invites and sharing preferences.
--
-- Friends share almost nothing. Only a display name, a program name, which days
-- had a session and a streak ever cross the boundary, and each of those is
-- gated by the owner's sharing_prefs. Weights, measurements, photos and sets
-- are never exposed — the crew view is a SECURITY DEFINER function that reads
-- each member's own rows and returns aggregates only.

create table if not exists public.sharing_prefs (
  user_id uuid primary key references auth.users on delete cascade,
  share_sessions boolean not null default true,
  share_streak boolean not null default true,
  share_program_name boolean not null default true
);

alter table public.sharing_prefs enable row level security;

drop policy if exists "sharing_prefs: own row" on public.sharing_prefs;
create policy "sharing_prefs: own row"
  on public.sharing_prefs for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.crew_invites (
  code text primary key,
  inviter_id uuid not null references auth.users on delete cascade,
  uses_left int not null default 3 check (uses_left >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists crew_invites_inviter_idx on public.crew_invites (inviter_id);

alter table public.crew_invites enable row level security;

-- You can manage your own codes. Redeeming someone else's goes through
-- redeem_crew_invite(), which is SECURITY DEFINER — a code is not readable.
drop policy if exists "crew_invites: own rows" on public.crew_invites;
create policy "crew_invites: own rows"
  on public.crew_invites for all
  using (inviter_id = (select auth.uid()))
  with check (inviter_id = (select auth.uid()));

create table if not exists public.crew_links (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint crew_links_no_self check (user_id <> friend_id)
);

alter table public.crew_links enable row level security;

drop policy if exists "crew_links: own rows" on public.crew_links;
create policy "crew_links: own rows"
  on public.crew_links for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into public.sharing_prefs (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Extend the signup trigger so sharing prefs exist from the start too.
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

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.sharing_prefs (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- --------------------------------------------------------------- redemption

/**
 * Redeems an invite code, linking both people in both directions.
 * SECURITY DEFINER because the redeemer cannot select the invite row itself.
 */
create or replace function public.redeem_crew_invite(invite_code text)
returns table (friend_id uuid, friend_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  invite public.crew_invites%rowtype;
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;

  select * into invite
  from public.crew_invites
  where code = upper(trim(invite_code))
  for update;

  if not found then
    raise exception 'That invite code does not exist';
  end if;
  if invite.expires_at < now() then
    raise exception 'That invite code has expired';
  end if;
  if invite.uses_left <= 0 then
    raise exception 'That invite code has been used up';
  end if;
  if invite.inviter_id = caller then
    raise exception 'You cannot use your own invite code';
  end if;

  insert into public.crew_links (user_id, friend_id)
  values (caller, invite.inviter_id), (invite.inviter_id, caller)
  on conflict do nothing;

  update public.crew_invites
  set uses_left = uses_left - 1
  where code = invite.code;

  return query
  select p.id, p.display_name
  from public.profiles p
  where p.id = invite.inviter_id;
end;
$$;

revoke all on function public.redeem_crew_invite(text) from public;
grant execute on function public.redeem_crew_invite(text) to authenticated;

-- ------------------------------------------------------------- crew overview

/**
 * What your crew is allowed to see about you.
 *
 * Reads each friend's own rows under SECURITY DEFINER and returns only
 * aggregates, each gated by that friend's sharing_prefs. No weights, no
 * measurements, no photos, no set data leaves this function.
 */
create or replace function public.crew_overview()
returns table (
  friend_id uuid,
  display_name text,
  avatar_url text,
  program_name text,
  sessions_this_week int[],
  streak int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  week_start date := (date_trunc('week', now() at time zone 'utc'))::date;
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;

  return query
  with friends as (
    select cl.friend_id as id
    from public.crew_links cl
    where cl.user_id = caller
    union
    select caller
  ),
  prefs as (
    select f.id,
           coalesce(sp.share_sessions, true) as share_sessions,
           coalesce(sp.share_streak, true) as share_streak,
           coalesce(sp.share_program_name, true) as share_program_name
    from friends f
    left join public.sharing_prefs sp on sp.user_id = f.id
  ),
  week as (
    select s.user_id,
           array_agg(distinct extract(isodow from s.started_at)::int - 1) as days
    from public.workout_sessions s
    join friends f on f.id = s.user_id
    where s.ended_at is not null
      and s.started_at >= week_start
    group by s.user_id
  ),
  streaks as (
    select s.user_id, count(distinct s.started_at::date)::int as days
    from public.workout_sessions s
    join friends f on f.id = s.user_id
    where s.ended_at is not null
      and s.started_at >= now() - interval '30 days'
    group by s.user_id
  ),
  programs as (
    select distinct on (w.user_id) w.user_id, w.label
    from public.program_weeks w
    join friends f on f.id = w.user_id
    where w.status = 'published'
    order by w.user_id, w.week_start desc
  )
  select
    p.id,
    pr.display_name,
    pr.avatar_url,
    case when p.share_program_name then programs.label else null end,
    case when p.share_sessions then coalesce(week.days, '{}'::int[]) else '{}'::int[] end,
    case when p.share_streak then coalesce(streaks.days, 0) else 0 end
  from prefs p
  join public.profiles pr on pr.id = p.id
  left join week on week.user_id = p.id
  left join streaks on streaks.user_id = p.id
  left join programs on programs.user_id = p.id
  order by pr.display_name;
end;
$$;

revoke all on function public.crew_overview() from public;
grant execute on function public.crew_overview() to authenticated;
