-- Keep the browser-facing Supabase API to the columns the frontend actually selects.
-- Edge functions retain full trusted access. This migration changes grants only; no rows are modified.

-- Dated price panel: the UI selects eight fields; internal price provenance and
-- other instruments' metrics remain server-side.
revoke select on table public.asset_price_history_v1
  from public, anon, authenticated;
revoke select (
  frontend_asset_id, asset_key, instrument_id, provider, provider_symbol,
  display_name, instrument_type, currency, unit, frequency, is_primary,
  observation_date, price_timestamp, price, open, high, low, close,
  previous_price, change_abs, change_pct, is_market_open, source_url,
  retrieved_at, updated_at
) on table public.asset_price_history_v1
  from public, anon, authenticated;
grant select (
  frontend_asset_id, instrument_id, provider, provider_symbol,
  observation_date, price, close, updated_at
) on table public.asset_price_history_v1 to anon, authenticated;
grant select on table public.asset_price_history_v1 to service_role;
comment on view public.asset_price_history_v1 is
  'Public roles may read only the eight fields used by the dated-price panel; service_role retains the full provider-labelled view.';

-- The live asset tile needs these fields, including source_label so the chosen
-- data provider is actually displayed next to the value.
revoke select on table public.cached_assets
  from public, anon, authenticated;
revoke select (
  id, name, price, change, sparkline, updated_at, as_of, spark_dates, source_label
) on table public.cached_assets
  from public, anon, authenticated;
grant select (
  id, name, price, change, sparkline, updated_at, as_of, spark_dates, source_label
) on table public.cached_assets to anon, authenticated;
grant select on table public.cached_assets to service_role;

-- Raw slot configuration and owner preference rows are only read by trusted
-- edge functions. The browser uses slot_sources_view, which is the sanitized read model.
revoke select on table public.data_slot_registry
  from public, anon, authenticated;
revoke select (
  slot_id, number, section, title, kind, "columns", can_choose,
  sources, note, updated_at
) on table public.data_slot_registry
  from public, anon, authenticated;
drop policy if exists data_slot_registry_read on public.data_slot_registry;
grant select on table public.data_slot_registry to service_role;
comment on table public.data_slot_registry is
  'Internal slot registry. Browser status pages read the sanitized slot_sources_view instead.';

revoke select on table public.source_preferences
  from public, anon, authenticated;
revoke select (
  slot_id, source_id, priority, enabled, chosen_by, chosen_at
) on table public.source_preferences
  from public, anon, authenticated;
drop policy if exists source_preferences_read on public.source_preferences;
grant select on table public.source_preferences to service_role;
comment on table public.source_preferences is
  'Owner source choices for trusted edge functions. Browser status pages read the sanitized slot_sources_view instead.';

-- The status page does not need the cache bookkeeping timestamp.
revoke select on table public.news_source_health
  from public, anon, authenticated;
revoke select (
  source, last_seen_at, last_new_at, items, fresh, updated_at
) on table public.news_source_health
  from public, anon, authenticated;
grant select (source, last_seen_at, last_new_at, items, fresh)
  on table public.news_source_health to anon, authenticated;
grant select on table public.news_source_health to service_role;

-- The public source monitor does not display the reset-date field.
revoke select on table public.source_politeness_view
  from public, anon, authenticated;
revoke select (
  source_id, requests_today, day, last_status, last_ok_at, last_attempt_at,
  consecutive_failures, paused_until, verdict
) on table public.source_politeness_view
  from public, anon, authenticated;
grant select (
  source_id, requests_today, last_status, last_ok_at, last_attempt_at,
  consecutive_failures, paused_until, verdict
) on table public.source_politeness_view to anon, authenticated;
grant select on table public.source_politeness_view to service_role;
comment on view public.source_politeness_view is
  'Public source monitor view. Browser roles receive only the eight fields selected by the UI; reset date remains server-side.';

notify pgrst, 'reload schema';
