-- Keep the public status/source monitor read-only, but do not expose columns
-- added to these relations in the future without an explicit grant review.
--
-- The browser's current consumers select 5 + 5 + 9 fields from these relations.
-- Revoke relation-wide SELECT and re-grant only those fields. RLS and service-role
-- access are unchanged; no rows or historical data are modified.
-- `slot_sources_view` is the existing owner-context sanitized view over private
-- base tables; its explicit output columns and grants are the browser boundary.

revoke select on table
  public.site_health,
  public.site_health_check_stats_7d,
  public.slot_sources_view
from public, anon, authenticated;

grant select (
  id, checked_at, ok, "trigger", checks
) on table public.site_health to anon, authenticated;

grant select (
  check_name, samples, ok_samples, last_seen_at, last_fail_at
) on table public.site_health_check_stats_7d to anon, authenticated;

grant select (
  number, slot_id, section, title, can_choose, source_id, chosen, priority, why
) on table public.slot_sources_view to anon, authenticated;

notify pgrst, 'reload schema';
