-- Restrict the destructive maintenance function to trusted callers.
-- The scheduled cron job runs as postgres, which owns the function.
revoke execute on function public.prune_operational_logs(integer, integer, integer)
  from public, anon, authenticated;
