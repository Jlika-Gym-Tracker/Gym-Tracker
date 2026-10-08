-- JLIKA Gym — moving a whole training day to a different slot in the week.
--
-- Swapping two days means swapping their `day_index`: the rows themselves stay
-- put, so their exercises, and any session already logged against them, travel
-- with the day. Swapping the *contents* instead would silently relabel history
-- — a session recorded against "Monday · Push" would end up reading as whatever
-- moved into that row.
--
-- The obstacle is unique (week_id, day_index). A full week occupies every index
-- from 0 to 6, and the CHECK forbids parking a row outside that range, so there
-- is nowhere to put the first row while the second is still holding its slot.
-- Making the constraint deferrable lets both updates land and be judged
-- together at commit. Nothing uses this constraint as an ON CONFLICT target, so
-- deferring it costs nothing elsewhere.

alter table public.program_days
  drop constraint if exists program_days_week_id_day_index_key;

alter table public.program_days
  add constraint program_days_week_id_day_index_key
  unique (week_id, day_index) deferrable initially immediate;

/**
 * Swaps two days of the same week.
 *
 * SECURITY INVOKER on purpose: the caller's own row-level security decides
 * whether they may touch these rows, so this cannot be used to reorder someone
 * else's program.
 */
create or replace function public.swap_program_days(day_a uuid, day_b uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.program_days%rowtype;
  b public.program_days%rowtype;
begin
  if day_a = day_b then
    return;
  end if;

  select * into a from public.program_days where id = day_a;
  if not found then
    raise exception 'That day no longer exists';
  end if;

  select * into b from public.program_days where id = day_b;
  if not found then
    raise exception 'That day no longer exists';
  end if;

  if a.week_id <> b.week_id then
    raise exception 'Those days belong to different weeks';
  end if;

  set constraints public.program_days_week_id_day_index_key deferred;
  update public.program_days set day_index = b.day_index where id = a.id;
  update public.program_days set day_index = a.day_index where id = b.id;
end;
$$;

revoke all on function public.swap_program_days(uuid, uuid) from public;
revoke all on function public.swap_program_days(uuid, uuid) from anon;
grant execute on function public.swap_program_days(uuid, uuid) to authenticated;
