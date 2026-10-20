-- JLIKA Gym — the AI Coach: an optional model that drafts a week and reviews
-- what you logged, with nothing changing until you approve it.
--
-- It exists only when the server has ANTHROPIC_API_KEY, and only for accounts
-- that opted in. Everything here is the paper trail that keeps that promise:
--
--   profiles.ai_coach_consented_at  When this account agreed to send its data.
--                                   Null = never, or withdrawn. The app checks it
--                                   before every request, not just on the page.
--   ai_coach_intakes                The answers the plan is designed from.
--   ai_coach_runs                   Every request to the model: what kind, which
--                                   model, tokens, and why it failed if it did.
--                                   Also what the daily cap counts.
--   ai_coach_proposals              What came back: a drafted week, or a review.
--   ai_coach_changes                A review's discrete changes, and what you
--                                   decided about each. Rejected ones go back
--                                   into the next review so they are not
--                                   proposed again without new evidence.
--   ai_coach_snapshots              The week exactly as it stood before an
--                                   apply, so Revert can put it back.
--
-- Reverting rewrites program_days and program_exercises only. workout_sessions
-- and set_logs are never touched: the log is what happened.

-- ------------------------------------------------------------------ consent

alter table public.profiles
  add column if not exists ai_coach_consented_at timestamptz;

comment on column public.profiles.ai_coach_consented_at is
  'When this account opted in to the AI Coach. Null = not opted in (or withdrawn); nothing is sent to the model provider.';

-- ------------------------------------------------------------------- intake

create table if not exists public.ai_coach_intakes (
  user_id uuid primary key references auth.users on delete cascade,
  -- Validated by the app (lib/ai-coach/schemas.ts) before it is written.
  answers jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_coach_intakes enable row level security;

drop policy if exists "ai_coach_intakes: own rows" on public.ai_coach_intakes;
create policy "ai_coach_intakes: own rows"
  on public.ai_coach_intakes for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --------------------------------------------------------------------- runs
--
-- Readable by their owner, writable only through the two functions below.
-- The daily cap counts these rows, so a direct insert/update/delete policy
-- would let anyone with the publishable key reset their own cap.

create table if not exists public.ai_coach_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('plan', 'refine', 'review')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  model text not null,
  input_tokens int check (input_tokens is null or input_tokens >= 0),
  output_tokens int check (output_tokens is null or output_tokens >= 0),
  cache_read_tokens int check (cache_read_tokens is null or cache_read_tokens >= 0),
  -- Shown to the account owner as-is, so it never carries a stack trace.
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ai_coach_runs_user_created_idx
  on public.ai_coach_runs (user_id, created_at desc);

alter table public.ai_coach_runs enable row level security;

drop policy if exists "ai_coach_runs: read own" on public.ai_coach_runs;
create policy "ai_coach_runs: read own"
  on public.ai_coach_runs for select
  using (user_id = (select auth.uid()));

/**
 * Opens a run if the caller is under the cap, and returns its id.
 *
 * SECURITY DEFINER because runs have no insert policy (see above). It only
 * ever writes a row for auth.uid(). The cap comes from the server's
 * AI_COACH_DAILY_LIMIT; calling this directly with a bigger number gains
 * nothing, because only the server holds the key that makes a run cost money.
 *
 * Counts every run in the last 24 hours, failed ones included — a failure
 * may still have been billed. A per-user advisory lock makes the count and
 * the insert one step, so parallel requests cannot all slip under the cap.
 */
create or replace function public.ai_coach_start_run(p_kind text, p_model text, p_daily_limit int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_used int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;
  if p_kind not in ('plan', 'refine', 'review') then
    raise exception 'Unknown run kind.';
  end if;
  if p_daily_limit is null or p_daily_limit < 1 then
    raise exception 'ai_coach_daily_limit';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_coach_runs:' || v_uid::text, 0));

  -- A run the server never finished (killed at its time limit, say) would sit
  -- at "running" forever. Close those out so the log tells the truth.
  update public.ai_coach_runs
     set status = 'failed',
         error = 'Stopped before it finished.',
         finished_at = now()
   where user_id = v_uid
     and status = 'running'
     and created_at < now() - interval '10 minutes';

  select count(*) into v_used
    from public.ai_coach_runs
   where user_id = v_uid
     and created_at > now() - interval '24 hours';

  if v_used >= p_daily_limit then
    raise exception 'ai_coach_daily_limit';
  end if;

  insert into public.ai_coach_runs (user_id, kind, model)
  values (v_uid, p_kind, left(coalesce(p_model, 'unknown'), 80))
  returning id into v_id;

  return v_id;
end;
$$;

/**
 * Closes one of the caller's own open runs. A closed run cannot be reopened or
 * rewritten, and nothing here changes what the cap counts.
 */
create or replace function public.ai_coach_finish_run(
  p_run uuid,
  p_status text,
  p_input_tokens int,
  p_output_tokens int,
  p_cache_read_tokens int,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if p_status not in ('succeeded', 'failed') then
    raise exception 'A run finishes as succeeded or failed.';
  end if;

  update public.ai_coach_runs
     set status = p_status,
         input_tokens = greatest(p_input_tokens, 0),
         output_tokens = greatest(p_output_tokens, 0),
         cache_read_tokens = greatest(p_cache_read_tokens, 0),
         error = left(p_error, 500),
         finished_at = now()
   where id = p_run
     and user_id = auth.uid()
     and status = 'running';
end;
$$;

-- README rule: Supabase's default privileges grant EXECUTE to anon and
-- authenticated; revoking from public does not undo that.
revoke all on function public.ai_coach_start_run(text, text, int) from public;
revoke all on function public.ai_coach_start_run(text, text, int) from anon;
revoke all on function public.ai_coach_start_run(text, text, int) from authenticated;
grant execute on function public.ai_coach_start_run(text, text, int) to authenticated;

revoke all on function public.ai_coach_finish_run(uuid, text, int, int, int, text) from public;
revoke all on function public.ai_coach_finish_run(uuid, text, int, int, int, text) from anon;
revoke all on function public.ai_coach_finish_run(uuid, text, int, int, int, text) from authenticated;
grant execute on function public.ai_coach_finish_run(uuid, text, int, int, int, text) to authenticated;

-- ---------------------------------------------------------------- proposals

create table if not exists public.ai_coach_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  run_id uuid references public.ai_coach_runs on delete set null,
  kind text not null check (kind in ('plan', 'review')),
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'dismissed', 'superseded', 'reverted')),
  summary text,
  -- plan: the validated week. review: the advice notes and the fingerprint of
  -- the week the changes were written against, to catch a plan edited since.
  payload jsonb not null,
  -- review: the week whose plan was read.
  base_week_start date,
  -- Where an accepted proposal was written.
  applied_week_start date,
  -- A refined plan points at the draft it replaced.
  parent_id uuid references public.ai_coach_proposals on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists ai_coach_proposals_user_created_idx
  on public.ai_coach_proposals (user_id, created_at desc);

alter table public.ai_coach_proposals enable row level security;

drop policy if exists "ai_coach_proposals: own rows" on public.ai_coach_proposals;
create policy "ai_coach_proposals: own rows"
  on public.ai_coach_proposals for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------------ changes

create table if not exists public.ai_coach_changes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ai_coach_proposals on delete cascade,
  position smallint not null check (position >= 0),
  type text not null check (type in (
    'swap_exercise', 'add_exercise', 'remove_exercise',
    'set_sets', 'set_rep_range', 'set_target_seconds', 'set_load',
    'set_progression', 'set_superset', 'rename_day'
  )),
  -- The validated change, as the model proposed it.
  change jsonb not null,
  -- Rendered from the plan by the app, not taken from the model, so the
  -- before → after the person ticks is the one that gets applied.
  target_text text not null,
  before_text text not null,
  after_text text not null,
  rationale text not null,
  decision text not null default 'pending' check (decision in ('pending', 'accepted', 'rejected')),
  decided_at timestamptz,
  unique (proposal_id, position)
);

alter table public.ai_coach_changes enable row level security;

-- Ownership through the proposal, like program_days through program_weeks.
drop policy if exists "ai_coach_changes: through proposal" on public.ai_coach_changes;
create policy "ai_coach_changes: through proposal"
  on public.ai_coach_changes for all
  using (exists (
    select 1 from public.ai_coach_proposals p
    where p.id = proposal_id and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.ai_coach_proposals p
    where p.id = proposal_id and p.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------- snapshots

create table if not exists public.ai_coach_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  proposal_id uuid references public.ai_coach_proposals on delete set null,
  week_start date not null,
  -- {"week": null, "days": []} when there was no week yet; Revert then
  -- removes the one the apply created.
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  reverted_at timestamptz
);

create index if not exists ai_coach_snapshots_user_created_idx
  on public.ai_coach_snapshots (user_id, created_at desc);

alter table public.ai_coach_snapshots enable row level security;

drop policy if exists "ai_coach_snapshots: own rows" on public.ai_coach_snapshots;
create policy "ai_coach_snapshots: own rows"
  on public.ai_coach_snapshots for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
