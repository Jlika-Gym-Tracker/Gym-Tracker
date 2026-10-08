-- JLIKA Gym — the training week no longer has to start on a Monday.
--
-- Weeks were Monday→Sunday everywhere: `currentWeekStart()` snapped to Monday
-- and each day was labelled by its position in a fixed Mon..Sun array. Someone
-- whose split runs Saturday→Friday could not express that at all.
--
-- 0 = Sunday … 6 = Saturday, matching date-fns' weekStartsOn, so the value can
-- be handed straight to startOfWeek without translation.

alter table public.user_settings
  add column if not exists week_starts_on smallint not null default 1
  check (week_starts_on between 0 and 6);

comment on column public.user_settings.week_starts_on is
  'Which weekday a training week begins on. 0 = Sunday … 6 = Saturday (date-fns weekStartsOn). Existing rows keep Monday.';
