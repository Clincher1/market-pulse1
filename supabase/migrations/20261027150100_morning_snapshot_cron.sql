-- Stage 4 (2026-10-27): run the morning snapshot every day at 04:00 UTC
-- (07:00 Europe/Moscow). The secret stays in Vault and is read at runtime,
-- exactly like the existing public-writer cron jobs.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'morning-snapshot') then
    perform cron.unschedule('morning-snapshot');
  end if;
end $$;

select cron.schedule(
  'morning-snapshot',
  '0 4 * * *',
  $$SELECT net.http_post(url := 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/snapshot-morning', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$$
);
