-- Provider history + quote requests can exceed pg_net's 5-second default.
-- Preserve the existing schedule, authorization and URL; only extend the
-- response deadline. Never invoke the writer or the morning snapshot here.
DO $$
DECLARE
  target record;
BEGIN
  SELECT jobid, command INTO target FROM cron.job
  WHERE jobname = 'update-assets-every-5-min';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected update-assets cron job is absent';
  END IF;
  IF position('timeout_milliseconds' IN target.command) = 0 THEN
    IF target.command !~ 'net\.http_post\(\s*url\s*:?=' THEN
      RAISE EXCEPTION 'Unexpected update-assets command shape; left unchanged';
    END IF;
    PERFORM cron.alter_job(target.jobid, command := replace(
      target.command, 'net.http_post(',
      'net.http_post(timeout_milliseconds := 120000, '
    ));
  END IF;
END;
$$;
