-- Market Pulse V2 shadow "market memory" schedule.
--
-- DO NOT RUN until all of the following are true:
-- 1) GitHub Actions has deployed the guarded shadow writers from this repo.
-- 2) Direct publishable-key calls to classify-events-v2-shadow return 401.
-- 3) Dispatcher health with x-cron-secret returns 200.
-- 4) A classifier v3 batch of at most 2 events has been manually audited.
--
-- Only run-shadow-pipeline is called by pg_cron. It invokes one fixed step at
-- a time with the service-role key. Vault must contain the existing secret
-- named cron_secret.

select cron.schedule(
  'shadow-ingest-v2', '5,35 * * * *',
  $$select net.http_post(
    url := 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/run-shadow-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"step":"ingest"}'::jsonb,
    timeout_milliseconds := 140000
  );$$
);

select cron.schedule(
  'shadow-cluster-v2', '12,42 * * * *',
  $$select net.http_post(
    url := 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/run-shadow-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"step":"cluster"}'::jsonb,
    timeout_milliseconds := 140000
  );$$
);

select cron.schedule(
  'shadow-classify-v3', '20 * * * *',
  $$select net.http_post(
    url := 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/run-shadow-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"step":"classify","confirm_classify":true}'::jsonb,
    timeout_milliseconds := 140000
  );$$
);

select cron.schedule(
  'shadow-prices-v2', '20 5,17 * * *',
  $$select net.http_post(
    url := 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/run-shadow-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"step":"prices"}'::jsonb,
    timeout_milliseconds := 140000
  );$$
);

select cron.schedule(
  'shadow-evaluate-events-v2', '35 5,17 * * *',
  $$select net.http_post(
    url := 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/run-shadow-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"step":"evaluate_events"}'::jsonb,
    timeout_milliseconds := 140000
  );$$
);

select cron.schedule(
  'shadow-write-forecasts-v2', '45 5 * * *',
  $$select net.http_post(
    url := 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/run-shadow-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"step":"forecasts"}'::jsonb,
    timeout_milliseconds := 140000
  );$$
);

select cron.schedule(
  'shadow-evaluate-forecasts-v2', '50 5,17 * * *',
  $$select net.http_post(
    url := 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/run-shadow-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"step":"evaluate_forecasts"}'::jsonb,
    timeout_milliseconds := 140000
  );$$
);

-- Inspect after applying:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname like 'shadow-%' order by jobname;
