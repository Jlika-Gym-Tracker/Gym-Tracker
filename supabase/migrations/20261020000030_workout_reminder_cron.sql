-- JLIKA Gym — hourly workout-day reminder.
--
-- The endpoint does the deciding: each run it finds the people whose reminder
-- hour has just arrived in their own time zone, so the job itself runs every
-- hour on the hour rather than once per zone.
--
-- Like the weekly review, this pairs pg_cron with pg_net, both enabled once
-- under Database → Extensions, and needs two settings present, otherwise the
-- job is skipped rather than scheduled:
--
--   alter database postgres set app.workout_reminder_url = 'https://your-app/api/cron/workout-reminder';
--   alter database postgres set app.cron_secret = '<the same value as CRON_SECRET>';

do $$
declare
  target_url text := current_setting('app.workout_reminder_url', true);
  secret text := current_setting('app.cron_secret', true);
begin
  if target_url is null or secret is null then
    raise notice 'app.workout_reminder_url / app.cron_secret not set — workout reminder not scheduled.';
    return;
  end if;

  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron and pg_net are required for the workout reminder job.';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  perform cron.unschedule('jlika-workout-reminder')
  where exists (select 1 from cron.job where jobname = 'jlika-workout-reminder');

  -- Minute zero of every hour. Every zone with a whole-hour offset lands on a
  -- local hour boundary here; half-hour zones get theirs at :30 local, which is
  -- still inside the hour they asked for.
  perform cron.schedule(
    'jlika-workout-reminder',
    '0 * * * *',
    format(
      $job$select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );$job$,
      target_url,
      'Bearer ' || secret
    )
  );
end
$$;
