-- Keep scheduled-runner failures distinct from failing selfcheck results.
-- A selfcheck may persist red checks and still return HTTP 200; cron.job_run_details
-- therefore reports a successful invocation while site_health records ok=false.
create or replace function public.monitor_selfcheck_counts(p_since timestamptz)
returns table (succeeded bigint, failed bigint)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    count(*) filter (where h.ok is true)::bigint,
    count(*) filter (where h.ok is false)::bigint
  from public.site_health h
  where h.trigger = 'cron'
    and h.checked_at >= p_since;
$$;

revoke all on function public.monitor_selfcheck_counts(timestamptz) from public, anon, authenticated;
grant execute on function public.monitor_selfcheck_counts(timestamptz) to service_role;

notify pgrst, 'reload schema';
