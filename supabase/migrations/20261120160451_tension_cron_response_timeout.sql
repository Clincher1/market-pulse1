-- Preserve the existing job, schedule and authorization; wait for its response.
DO $$
DECLARE target record;
BEGIN
  SELECT jobid, command INTO target FROM cron.job WHERE jobname = 'update-tension-every-15-min';
  IF NOT FOUND THEN RAISE EXCEPTION 'Expected update-tension cron job is absent'; END IF;
  IF position('timeout_milliseconds' IN target.command) = 0 THEN
    IF target.command !~ 'net\.http_post\(\s*url\s*:?=' THEN RAISE EXCEPTION 'Unexpected update-tension command shape'; END IF;
    PERFORM cron.alter_job(target.jobid, command := replace(target.command, 'net.http_post(', 'net.http_post(timeout_milliseconds := 120000, '));
  END IF;
END;
$$;
