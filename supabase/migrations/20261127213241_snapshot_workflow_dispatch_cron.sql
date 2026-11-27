-- Half-hourly fallback for the static snapshot workflow. The GitHub token stays
-- in Edge Function Secrets; only the function URL and invocation secret are read
-- from Vault by pg_cron through pg_net.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Keep the endpoint address in Vault rather than embedding it in cron.job.
do $vault$
begin
  if not exists (
    select 1 from vault.secrets where name = 'snapshot_workflow_dispatch_url'
  ) then
    perform vault.create_secret(
      'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/dispatch-snapshot-workflow',
      'snapshot_workflow_dispatch_url',
      'Supabase Edge Function URL for the static snapshot GitHub Actions fallback',
      null
    );
  end if;
end;
$vault$;

-- This is intentionally separate from the :12 scheduled-job-runner and :42
-- run-shadow-pipeline slots.
do $schedule$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'dispatch-static-snapshot-half-hourly';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'dispatch-static-snapshot-half-hourly',
    '0,30 * * * *',
    $command$
      select net.http_post(
        url := (select decrypted_secret
                from vault.decrypted_secrets
                where name = 'snapshot_workflow_dispatch_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret
                            from vault.decrypted_secrets
                            where name = 'cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $command$
  );
end;
$schedule$;
