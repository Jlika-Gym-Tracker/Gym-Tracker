-- JLIKA Gym — how a movement is logged, supersets, and progression rules.
--
-- Until now every set was weight × reps. A plank has no reps, a treadmill has
-- neither, and logging either as "1 rep" made every number derived from it
-- (volume, PRs, the progression hint) quietly wrong. Each movement now says how
-- it is logged:
--
--   reps    weight × reps, as before
--   time    held for a duration (planks, hangs, carries); may carry a load
--   cardio  duration plus an optional distance
--
-- set_logs gains the two columns the new modes need. reps and weight_kg were
-- already nullable, so nothing about existing rows changes.

-- ------------------------------------------------------------- exercises

alter table public.exercises
  add column if not exists tracking text not null default 'reps';

alter table public.exercises
  drop constraint if exists exercises_tracking_check;
alter table public.exercises
  add constraint exercises_tracking_check
  check (tracking in ('reps', 'time', 'cardio'));

-- ------------------------------------------------------------- set logs

alter table public.set_logs
  add column if not exists duration_s int,
  add column if not exists distance_m numeric(9,1);

alter table public.set_logs
  drop constraint if exists set_logs_duration_s_check;
alter table public.set_logs
  add constraint set_logs_duration_s_check
  check (duration_s is null or (duration_s >= 0 and duration_s <= 86400));

alter table public.set_logs
  drop constraint if exists set_logs_distance_m_check;
alter table public.set_logs
  add constraint set_logs_distance_m_check
  check (distance_m is null or distance_m >= 0);

-- --------------------------------------------------- program: the plan side
--
-- superset_group  Exercises of one day that share a number are done back to
--                 back, with rest only after the last of them. Null = alone.
-- target_seconds  Hold time per set for a timed movement; session length for
--                 cardio. Ignored for reps movements.
-- progression     The rule that moves this exercise's load forward. Null means
--                 "whatever the day says", so a day can switch everything to
--                 linear while one accessory stays on double progression.
-- increment_kg    The step that rule adds. Null = the default for the movement
--                 (5 kg for big lower-body lifts, 2.5 kg for the rest).

alter table public.program_days
  add column if not exists progression text not null default 'double';

alter table public.program_days
  drop constraint if exists program_days_progression_check;
alter table public.program_days
  add constraint program_days_progression_check
  check (progression in ('off', 'double', 'linear', 'greyskull'));

alter table public.program_exercises
  add column if not exists superset_group smallint,
  add column if not exists target_seconds int,
  add column if not exists progression text,
  add column if not exists increment_kg numeric(5,2);

alter table public.program_exercises
  drop constraint if exists program_exercises_superset_group_check;
alter table public.program_exercises
  add constraint program_exercises_superset_group_check
  check (superset_group is null or superset_group between 1 and 9);

alter table public.program_exercises
  drop constraint if exists program_exercises_target_seconds_check;
alter table public.program_exercises
  add constraint program_exercises_target_seconds_check
  check (target_seconds is null or target_seconds between 1 and 14400);

alter table public.program_exercises
  drop constraint if exists program_exercises_progression_check;
alter table public.program_exercises
  add constraint program_exercises_progression_check
  check (progression is null or progression in ('off', 'double', 'linear', 'greyskull', 'time'));

alter table public.program_exercises
  drop constraint if exists program_exercises_increment_kg_check;
alter table public.program_exercises
  add constraint program_exercises_increment_kg_check
  check (increment_kg is null or (increment_kg > 0 and increment_kg <= 50));

-- ------------------------------------------------- how a session felt
--
-- One tap on the finish summary: 1 = too easy, 2 = about right, 3 = brutal.
-- The free-text half goes in workout_sessions.notes, which already exists.

alter table public.workout_sessions
  add column if not exists rating smallint;

alter table public.workout_sessions
  drop constraint if exists workout_sessions_rating_check;
alter table public.workout_sessions
  add constraint workout_sessions_rating_check
  check (rating is null or rating between 1 and 3);

-- ------------------------------------------- movements the new modes need
--
-- From free-exercise-db (public domain), like the rest of the library.

update public.exercises set tracking = 'time' where slug = 'farmers-walk' and owner_id is null;

insert into public.exercises
  (slug, name, primary_muscle, secondary_muscles, equipment, aliases,
   image_start_url, image_end_url, how_to, cues, common_mistake, tracking)
values
  ('plank', 'Plank', 'abdominals', '{}'::text[], 'body_only', array['Front Plank','Forearm Plank']::text[],
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Plank/0.jpg',
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Plank/1.jpg',
   array['Get into a prone position on the floor, supporting your weight on your toes and your forearms. Your arms are bent and directly below the shoulder.','Keep your body straight at all times, and hold this position as long as possible. To increase difficulty, an arm or leg can be raised.']::text[],
   array['Squeeze your glutes — it stops the hips sagging.']::text[],
   'Letting the hips drift up into a pike, which turns it into a rest.', 'time'),
  ('side-bridge', 'Side Plank', 'abdominals', array['shoulders']::text[], 'body_only', array['Side Bridge']::text[],
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Bridge/0.jpg',
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Bridge/1.jpg',
   array['Lie on one side with your forearm under your shoulder and your legs stacked.','Lift your hips until your body is a straight line from head to feet, and hold.','Switch sides and repeat.']::text[],
   array['Stack the shoulder directly over the elbow.']::text[], null, 'time'),
  ('running-treadmill', 'Running, Treadmill', 'quadriceps', array['calves','glutes','hamstrings']::text[], 'machine', array['Treadmill Run','Treadmill','Running']::text[],
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Running_Treadmill/0.jpg',
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Running_Treadmill/1.jpg',
   array['Step onto the treadmill and choose a manual setting or a program.','Maintain proper posture as you run, and only hold onto the handles when necessary, such as when dismounting.']::text[],
   '{}'::text[], null, 'cardio'),
  ('walking-treadmill', 'Walking, Treadmill', 'quadriceps', array['calves','glutes','hamstrings']::text[], 'machine', array['Treadmill Walk','Incline Walk','Walking']::text[],
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Walking_Treadmill/0.jpg',
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Walking_Treadmill/1.jpg',
   array['Step onto the treadmill and choose a manual setting or a program.','Walk at a moderate to fast pace, adding incline to raise the intensity.']::text[],
   '{}'::text[], null, 'cardio'),
  ('bicycling-stationary', 'Stationary Bike', 'quadriceps', array['calves','glutes','hamstrings']::text[], 'machine', array['Bicycling, Stationary','Exercise Bike','Bike']::text[],
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bicycling_Stationary/0.jpg',
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bicycling_Stationary/1.jpg',
   array['Seat yourself on the bike and adjust the seat to your height.','Choose a manual setting or a program, and change the resistance as you go.']::text[],
   '{}'::text[], null, 'cardio'),
  ('rowing-stationary', 'Rowing Machine', 'quadriceps', array['biceps','calves','glutes','hamstrings','lower_back','middle_back']::text[], 'machine', array['Rowing, Stationary','Rower','Erg']::text[],
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Rowing_Stationary/0.jpg',
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Rowing_Stationary/1.jpg',
   array['Sit on the rower with your heels against the base of the foot pedals and the straps secured.','Push through the pedals and extend your legs, then bring your hands to your upper abdomen, squeezing your shoulders back.','Recover by straightening the arms, bending the knees and coming forward again.']::text[],
   array['Legs, then back, then arms — and reverse it on the way in.']::text[],
   'Pulling mostly with the arms; the drive comes from the legs.', 'cardio'),
  ('elliptical-trainer', 'Elliptical Trainer', 'quadriceps', array['calves','glutes','hamstrings']::text[], 'machine', array['Elliptical','Cross Trainer']::text[],
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Elliptical_Trainer/0.jpg',
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Elliptical_Trainer/1.jpg',
   array['Step onto the elliptical and choose a manual setting or a program.','Adjust the resistance or incline to change the intensity.']::text[],
   '{}'::text[], null, 'cardio'),
  ('stairmaster', 'Stairmaster', 'quadriceps', array['calves','glutes','hamstrings']::text[], 'machine', array['Stair Climber','Stairs']::text[],
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Stairmaster/0.jpg',
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Stairmaster/1.jpg',
   array['Step onto the stairmaster and choose a manual setting or a program.','Pump your legs in a steady rhythm, driving the pedals down but not all the way to the floor.']::text[],
   '{}'::text[], null, 'cardio'),
  ('rope-jumping', 'Jump Rope', 'quadriceps', array['calves','hamstrings']::text[], 'other', array['Rope Jumping','Skipping']::text[],
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Rope_Jumping/0.jpg',
   'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Rope_Jumping/1.jpg',
   array['Hold an end of the rope in each hand with the rope behind you.','Turn the rope over your head and jump it as it reaches the ground. Find a pace you can hold.']::text[],
   '{}'::text[], null, 'cardio')
on conflict (slug) do update set
  name = excluded.name,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  aliases = excluded.aliases,
  image_start_url = excluded.image_start_url,
  image_end_url = excluded.image_end_url,
  how_to = excluded.how_to,
  cues = excluded.cues,
  common_mistake = excluded.common_mistake,
  tracking = excluded.tracking;
