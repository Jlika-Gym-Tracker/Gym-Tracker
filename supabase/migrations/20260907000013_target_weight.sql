-- JLIKA Gym — planned load on a program exercise.
--
-- Until now a week said "3 × 8-12" but not at what weight; the load lived only
-- in set_logs, after the fact. That is fine when you already know what you lift
-- and useless when you do not. This column lets "copy last week" carry the load
-- forward and step it up where last week earned it.
--
-- Null means "no planned load" — pasted weeks, templates and hand-built days
-- all start that way, and the session screen simply leaves the field empty.

alter table public.program_exercises
  add column if not exists target_weight_kg numeric(6,2)
    check (target_weight_kg is null or (target_weight_kg >= 0 and target_weight_kg <= 1000));

comment on column public.program_exercises.target_weight_kg is
  'Planned working load in kg. Null when none is planned. Logged sets in set_logs remain the record of what was actually lifted.';
