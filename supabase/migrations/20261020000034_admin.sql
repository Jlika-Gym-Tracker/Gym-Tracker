-- JLIKA Gym — the operator dashboard and invite-only signup.
--
-- PRIVACY BOUNDARY. The app promises that nobody can read anyone else's data,
-- and the operator is not an exception. Everything the dashboard can see goes
-- through the admin_* functions below, and they return account-level facts and
-- counts only:
--
--   email, signup date, last sign-in, disabled or not
--   number of finished sessions, date of the last one
--   whether a session is open right now, and since when
--
-- Never weights, sets, exercises, weigh-ins, photos, nutrition or notes. The
-- boundary is the functions' return types, not the screen: a dashboard bug can
-- only show what these functions hand back.
--
-- app_settings        One row of instance-wide switches. Today only
--                     invite_only. Kept in the database rather than in the
--                     app's environment because the signup trigger below is the
--                     one place a direct auth.signUp() with the publishable key
--                     can be stopped, and it cannot read the app's environment.
-- signup_invites      Codes an operator hands out while signup is invite-only.
--                     Each has a number of uses and an optional expiry, and can
--                     be revoked.
--
-- Neither table is readable or writable by anon or authenticated: RLS is on
-- with no policies, and the table grants are revoked as well. The dashboard
-- manages them with the server's secret key; signup reaches them only through
-- the trigger and signup_invite_required().

-- ------------------------------------------------------------- app settings

create table if not exists public.app_settings (
  -- A single row: the check makes a second one impossible.
  id smallint primary key default 1 check (id = 1),
  invite_only boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;
grant select, update on table public.app_settings to service_role;

-- ----------------------------------------------------------- signup invites

create table if not exists public.signup_invites (
  -- JLIKA-XXXX-XXXX-XXXX from a 32-letter alphabet with no I, O, 0 or 1:
  -- 60 bits, so not worth guessing. lib/admin/invite-code.ts generates them.
  code text primary key
    check (code ~ '^JLIKA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  max_uses int not null default 1 check (max_uses between 1 and 100),
  uses int not null default 0 check (uses >= 0 and uses <= max_uses),
  -- Null = never expires.
  expires_at timestamptz,
  -- Who it was for, in the operator's words. Shown only on the dashboard.
  note text check (note is null or char_length(note) <= 60),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.signup_invites enable row level security;
revoke all on table public.signup_invites from anon, authenticated;
grant select, insert, update on table public.signup_invites to service_role;

-- ------------------------------------------------------ invite-only signup

/**
 * Whether signup currently needs an invite code. The signup form asks before
 * it renders the field; it reveals one boolean and nothing about any code.
 */
create or replace function public.signup_invite_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.invite_only from public.app_settings s where s.id = 1), false);
$$;

/**
 * Refuses a new account while signup is invite-only, unless it carries a valid
 * code in raw_user_meta_data.signup_code — and consumes one use of it.
 *
 * A trigger on auth.users rather than a check in the app, because anyone can
 * call Supabase's signUp directly with the publishable key from the browser
 * bundle; only the database sees every new account.
 *
 *   * Existing accounts are untouched: this runs on insert only, so signing in,
 *     confirming an email or changing a password never reaches it.
 *   * Google and other OAuth signups carry no code, so while invite-only is on
 *     a first-time OAuth sign-in is refused. Someone who already has an
 *     account can still link Google to it, because that inserts no user.
 *   * The single UPDATE is the check and the consumption at once: the row lock
 *     means two signups racing for a code's last use cannot both get it.
 *   * Raising aborts the insert. Recent GoTrue passes this message through;
 *     older versions say "Database error saving new user". The signUp action
 *     recognises both.
 *   * The code stays in the account's own metadata (GoTrue writes metadata
 *     back after the insert, so it cannot be stripped here). It is spent, and
 *     only that account can see it.
 */
create or replace function public.enforce_signup_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data ->> 'signup_code', '')));
begin
  if not coalesce((select s.invite_only from public.app_settings s where s.id = 1), false) then
    return new;
  end if;

  update public.signup_invites i
     set uses = i.uses + 1,
         last_used_at = now()
   where i.code = v_code
     and i.revoked_at is null
     and (i.expires_at is null or i.expires_at > now())
     and i.uses < i.max_uses;

  if not found then
    raise exception 'Signups are invite-only: a valid, unexpired invite code is required.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_signup_invite on auth.users;
create trigger enforce_signup_invite
  before insert on auth.users
  for each row execute function public.enforce_signup_invite();

-- ------------------------------------------------- operator aggregates
--
-- All four are SECURITY DEFINER because they read auth.users, and all four are
-- executable by service_role only — the server's secret key, after it has
-- checked that the signed-in user is on ADMIN_EMAILS. Every column they return
-- is listed in the boundary at the top of this file.

/**
 * The dashboard's totals. "Active" is an account that signed in or started a
 * session in the window — the only two activity signals inside the boundary.
 */
create or replace function public.admin_overview(p_week_start date)
returns table (
  accounts bigint,
  active_7d bigint,
  active_30d bigint,
  sessions_this_week bigint,
  disabled bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with trained as (
    select ws.user_id, max(ws.started_at) as last_started
    from public.workout_sessions ws
    where ws.started_at > now() - interval '30 days'
    group by ws.user_id
  ),
  seen as (
    select
      greatest(u.last_sign_in_at, t.last_started) as last_seen,
      coalesce(u.banned_until > now(), false) as is_disabled
    from auth.users u
    left join trained t on t.user_id = u.id
  )
  select
    count(*),
    count(*) filter (where seen.last_seen > now() - interval '7 days'),
    count(*) filter (where seen.last_seen > now() - interval '30 days'),
    (select count(*) from public.workout_sessions ws
      where ws.started_at >= p_week_start::timestamptz),
    count(*) filter (where seen.is_disabled)
  from seen;
$$;

/**
 * One page of accounts, newest first, optionally narrowed to emails containing
 * p_search. total is the number of matches across all pages.
 */
create or replace function public.admin_accounts(p_search text, p_limit int, p_offset int)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  disabled boolean,
  finished_sessions bigint,
  last_trained_at timestamptz,
  open_session_since timestamptz,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with matched as (
    select
      u.id,
      u.email::text as email,
      u.created_at,
      u.last_sign_in_at,
      coalesce(u.banned_until > now(), false) as is_disabled,
      count(*) over () as total
    from auth.users u
    where coalesce(trim(p_search), '') = ''
       or u.email ilike '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by u.created_at desc, u.id
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    m.id,
    m.email,
    m.created_at,
    m.last_sign_in_at,
    m.is_disabled,
    coalesce(f.finished, 0),
    f.last_started,
    o.started_at,
    m.total
  from matched m
  left join lateral (
    select count(*) as finished, max(ws.started_at) as last_started
    from public.workout_sessions ws
    where ws.user_id = m.id and ws.ended_at is not null
  ) f on true
  left join lateral (
    select ws.started_at
    from public.workout_sessions ws
    where ws.user_id = m.id and ws.ended_at is null
    order by ws.started_at desc
    limit 1
  ) o on true
  order by m.created_at desc, m.id;
$$;

/**
 * Who is training right now: an open session started in the last four hours,
 * on an account that is not disabled. Email and start time, nothing else —
 * not the day, the exercise or how far through they are.
 */
create or replace function public.admin_training_now()
returns table (email text, started_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text, ws.started_at
  from public.workout_sessions ws
  join auth.users u on u.id = ws.user_id
  where ws.ended_at is null
    and ws.started_at > now() - interval '4 hours'
    and not coalesce(u.banned_until > now(), false)
  order by ws.started_at;
$$;

/**
 * Ends every session of one account, so disabling it signs it out now.
 *
 * Banning (done through the Auth admin API) stops new sign-ins and refreshes,
 * but leaves current sessions alive. Deleting them makes the next getUser()
 * fail with session_not_found, which the middleware treats as signed out.
 * Refresh tokens go with them (ON DELETE CASCADE).
 */
create or replace function public.admin_end_sessions(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.sessions s where s.user_id = p_user;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------------ grants
--
-- Supabase's default privileges grant EXECUTE on new functions to anon and
-- authenticated explicitly, so revoking from public alone is not enough.

revoke all on function public.signup_invite_required() from public, anon, authenticated;
grant execute on function public.signup_invite_required() to anon, authenticated, service_role;

-- A trigger function; nothing should call it directly.
revoke all on function public.enforce_signup_invite() from public, anon, authenticated;

revoke all on function public.admin_overview(date) from public, anon, authenticated;
revoke all on function public.admin_accounts(text, int, int) from public, anon, authenticated;
revoke all on function public.admin_training_now() from public, anon, authenticated;
revoke all on function public.admin_end_sessions(uuid) from public, anon, authenticated;

grant execute on function public.admin_overview(date) to service_role;
grant execute on function public.admin_accounts(text, int, int) to service_role;
grant execute on function public.admin_training_now() to service_role;
grant execute on function public.admin_end_sessions(uuid) to service_role;
