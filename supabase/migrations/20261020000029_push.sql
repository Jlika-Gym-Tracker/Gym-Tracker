-- JLIKA Gym — web push: rest-timer alerts and workout-day reminders.
--
-- push_subscriptions  One row per browser that agreed to notifications. The
--                     endpoint is the push service's address for that browser.
--                     It is unique because a browser holds one subscription per
--                     site, whoever happens to be signed in.
-- rest_alerts         The rest-timer alert a session is waiting on, at most one
--                     per person. The server sleeps until ends_at and sends only
--                     if the row still carries the token it wrote, so starting a
--                     new rest replaces the pending alert and skipping one
--                     deletes it. A row is gone the moment its alert is sent.
--
-- user_settings gains the reminder preferences. "18:00" and "today" only mean
-- something in the lifter's own time zone, so the browser's zone is saved when a
-- device subscribes and the hourly reminder job reads it.

-- ------------------------------------------------------ push subscriptions

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique
    check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
  -- The two keys the browser hands over with its subscription. Payloads are
  -- encrypted to them, so the push service never sees what a notification says.
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: own rows" on public.push_subscriptions;
create policy "push_subscriptions: own rows"
  on public.push_subscriptions for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

/**
 * Saves this browser's subscription for the signed-in account.
 *
 * A browser keeps its subscription across sign-outs, so on a shared phone the
 * same endpoint can arrive from a second account. RLS hides the first account's
 * row, and the unique endpoint would then reject the insert with nothing the
 * caller can do about it. This hands the endpoint to whoever is signed in now,
 * which is who should hear from that device. Knowing an endpoint means holding
 * the browser it belongs to, so this cannot be used to take over someone else's.
 */
create or replace function public.save_push_subscription(
  sub_endpoint text,
  sub_p256dh text,
  sub_auth text,
  sub_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  delete from public.push_subscriptions
  where endpoint = sub_endpoint and user_id <> me;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (me, sub_endpoint, sub_p256dh, sub_auth, left(sub_user_agent, 300))
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public;
revoke all on function public.save_push_subscription(text, text, text, text) from anon;
revoke all on function public.save_push_subscription(text, text, text, text) from authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ------------------------------------------------------------ rest alerts

create table if not exists public.rest_alerts (
  user_id uuid primary key references auth.users on delete cascade,
  -- Rewritten on every schedule. The sleeping sender compares it before
  -- sending, which is what makes a replaced or cancelled alert stay silent.
  token uuid not null,
  -- Only the device that started the rest hears about it; a laptop left open
  -- at home should not beep because a set ended at the gym.
  endpoint text not null,
  -- Where tapping the notification lands: the session it came from.
  url text not null default '/' check (url like '/%' and char_length(url) <= 300),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.rest_alerts enable row level security;

drop policy if exists "rest_alerts: own row" on public.rest_alerts;
create policy "rest_alerts: own row"
  on public.rest_alerts for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------- user settings
--
-- notify_workout_day  Push on a training day of the published week if no
--                     session has started by reminder_hour. Off by default: it
--                     only works once a device has subscribed anyway.
-- reminder_hour       Local hour, 0–23, the reminder goes out at.
-- timezone            IANA name from the browser (Intl), e.g. Europe/Paris.
-- rest_push           Push when rest runs out while the app is in the
--                     background. On by default; it does nothing until a
--                     device subscribes.

alter table public.user_settings
  add column if not exists notify_workout_day boolean not null default false,
  add column if not exists reminder_hour smallint not null default 18,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists rest_push boolean not null default true;

alter table public.user_settings
  drop constraint if exists user_settings_reminder_hour_check;
alter table public.user_settings
  add constraint user_settings_reminder_hour_check
  check (reminder_hour between 0 and 23);

alter table public.user_settings
  drop constraint if exists user_settings_timezone_check;
alter table public.user_settings
  add constraint user_settings_timezone_check
  check (char_length(timezone) between 1 and 64);
