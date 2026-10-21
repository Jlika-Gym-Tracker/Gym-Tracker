-- JLIKA Gym — the full exercise library: featured movements and archiving.
--
-- featured     The hand-picked movements (0003's seed and 0028's timed and
--              cardio rows). 0033 adds the rest of free-exercise-db with
--              featured = false, and the builder, the paste matcher and the
--              AI Coach lead with the featured ones so ~700 extra rows do not
--              bury them. Only global rows can be featured.
--
-- archived_at  Set when someone removes one of their own movements that has
--              logged sets. It leaves the library and the pickers, but the row
--              stays, so history, summaries and charts still have its name.
--              A movement with no logs is deleted outright instead. Only your
--              own movements can be archived; the global ones are not yours to
--              remove.

-- Every global row at the moment the column appears is a curated one, so they
-- are marked featured then and only then. Re-running this file after 0033 must
-- not promote the long tail, which is why it is keyed on the column's absence
-- rather than on owner_id alone.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exercises' and column_name = 'featured'
  ) then
    alter table public.exercises add column featured boolean not null default false;
    update public.exercises set featured = true where owner_id is null;
  end if;
end
$$;

alter table public.exercises
  drop constraint if exists exercises_featured_global_check;
alter table public.exercises
  add constraint exercises_featured_global_check
  check (not featured or owner_id is null);

alter table public.exercises
  add column if not exists archived_at timestamptz;

alter table public.exercises
  drop constraint if exists exercises_archived_own_check;
alter table public.exercises
  add constraint exercises_archived_own_check
  check (archived_at is null or owner_id is not null);
