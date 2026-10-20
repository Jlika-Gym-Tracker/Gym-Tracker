-- JLIKA Gym — preferences for the workout screen, and a goal weight.
--
-- keep_awake   Hold a screen wake lock while a session is open, so a phone does
--              not lock between sets. On by default: unlocking and finding your
--              place again after every set is the most annoying part of logging.
-- rest_sound   Beep (and vibrate, where the device can) when rest runs out.
-- effort_scale Which scale the effort column asks in. Stored values are always
--              RPE in set_logs.rpe; RIR is RPE read the other way (RIR = 10 − RPE),
--              so switching scale never rewrites a logged set. 'off' hides the
--              column. Defaults to 'rpe' because that column already exists.
--
-- goal_weight_kg draws a target line on the weight chart and colours each change
-- by whether it moved toward it. Null = no goal, and nothing is coloured.
--
-- body_figure picks the figure the muscle map is drawn on. It is a drawing
-- preference only and is not read for anything else.

alter table public.user_settings
  add column if not exists keep_awake boolean not null default true,
  add column if not exists rest_sound boolean not null default true,
  add column if not exists effort_scale text not null default 'rpe';

alter table public.user_settings
  drop constraint if exists user_settings_effort_scale_check;
alter table public.user_settings
  add constraint user_settings_effort_scale_check
  check (effort_scale in ('off', 'rpe', 'rir'));

alter table public.profiles
  add column if not exists goal_weight_kg numeric(5,2),
  add column if not exists body_figure text not null default 'male';

alter table public.profiles
  drop constraint if exists profiles_goal_weight_kg_check;
alter table public.profiles
  add constraint profiles_goal_weight_kg_check
  check (goal_weight_kg is null or (goal_weight_kg > 20 and goal_weight_kg < 400));

alter table public.profiles
  drop constraint if exists profiles_body_figure_check;
alter table public.profiles
  add constraint profiles_body_figure_check
  check (body_figure in ('male', 'female'));
