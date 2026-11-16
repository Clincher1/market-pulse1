-- Limit browser access to the fields used by the documented public interface.
-- Internal event-analysis views and legacy current-forecast caches remain available
-- to trusted server roles. Historical rows are preserved.

revoke select on table
  public.market_memory_events_v1,
  public.market_memory_event_outcomes_v1,
  public.market_memory_analogues_v1,
  public.forecast_latest_v2,
  public.forecast_track_record
from public, anon, authenticated;

-- The public archive remains available, but only the columns requested by the UI.
revoke select on table public.market_memory_forecasts_v1
  from public, anon, authenticated;
grant select (
  forecast_id,
  asset_key,
  issued_at,
  issue_date,
  horizon_trading_days,
  direction,
  aggregation_version,
  prompt_version,
  outcome_status,
  outcome_observation_date,
  return_pct,
  direction_hit
) on table public.market_memory_forecasts_v1 to anon, authenticated;

-- Keep the mixed internal stats view for service-side checks; expose only forecast stats to browsers.
revoke select on table public.market_memory_stats_v1
  from public, anon, authenticated;
grant select (
  forecast_snapshots,
  evaluated_forecasts,
  pending_forecasts,
  latest_forecast_issued_at,
  latest_price_fetch_at
) on table public.market_memory_stats_v1 to anon, authenticated;

-- No browser code reads the legacy cached forecast table. The service role keeps its existing access.
revoke select on table public.cached_forecasts
  from public, anon, authenticated;
drop policy if exists "Allow public read access" on public.cached_forecasts;
comment on table public.cached_forecasts is
  'Legacy forecast cache retained for trusted server-side jobs; not exposed to browser roles.';

-- Public passport clients request only these columns. Tension and forecast payloads
-- remain intact in historical rows but are not selectable by browser roles.
revoke select on table public.daily_snapshots
  from public, anon, authenticated;
grant select (date, captured_at, assets, russia)
  on table public.daily_snapshots to anon, authenticated;
comment on table public.daily_snapshots is
  'Morning baselines. Browser roles may read date, captured_at, assets and russia only; tension and forecasts remain internal historical fields.';
comment on column public.daily_snapshots.tension is
  'Internal legacy snapshot field; preserved but not granted to browser roles.';
comment on column public.daily_snapshots.forecasts is
  'Legacy forecast snapshots; preserved but not granted to browser roles.';
