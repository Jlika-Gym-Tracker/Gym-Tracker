-- JLIKA Gym — Phase 8: Sunday weekly review.
--
-- pg_cron cannot call an HTTPS endpoint on its own, so this pairs it with
-- pg_net. Both need enabling once under Database → Extensions, and two settings
-- must be present, otherwise the job is skipped rather than scheduled:
--
--   alter database postgres set app.weekly_review_url = 'https://your-app/api/cron/weekly-review';
--   alter database postgres set app.cron_secret = '<the same value as CRON_SECRET>';

do $$
declare
  target_url text := current_setting('app.weekly_review_url', true);
  secret text := current_setting('app.cron_secret', true);
begin
  if target_url is null or secret is null then
    raise notice 'app.weekly_review_url / app.cron_secret not set — weekly review not scheduled.';
    return;
  end if;

  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron and pg_net are required for the weekly review job.';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  perform cron.unschedule('jlika-weekly-review')
  where exists (select 1 from cron.job where jobname = 'jlika-weekly-review');

  -- Sundays at 18:00 UTC, after most people have finished training.
  perform cron.schedule(
    'jlika-weekly-review',
    '0 18 * * 0',
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
