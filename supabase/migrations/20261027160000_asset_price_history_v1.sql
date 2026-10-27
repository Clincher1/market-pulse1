-- Stage 6 (2026-10-27): public dated price history for the asset panel.
--
-- The shadow tables remain service-role-only. This migration adds one
-- sanitized, provider-labelled read model over dated daily observations.
-- Provider series deliberately stay separate: callers must choose an
-- instrument instead of receiving a silently spliced asset series.
--
-- Gold needs a dedicated Twelve Data daily instrument. The existing
-- FRED/Nasdaq gold series is an index in points and is used internally for
-- returns; it must not be presented as the XAU/USD spot price shown on the
-- tile. The new instrument is not primary, so Market Memory evaluation keeps
-- using its existing primary series unchanged.

insert into public.asset_instruments_v2
  (id, asset_key, provider, provider_symbol, display_name, instrument_type,
   currency, unit, frequency, is_primary, enabled, notes)
values
  ('gold_twelve_xauusd_daily', 'gold', 'Twelve Data', 'XAU/USD',
   'Gold Spot / US Dollar daily (Twelve Data XAU/USD)',
   'commodity_spot', 'USD', 'usd_per_troy_ounce', 'daily', false, true,
   'Daily XAU/USD spot closes from Twelve Data time_series. Used by the Stage 6 public dated panel; separate from the intraday quote snapshot and from the FRED/Nasdaq gold index.')
on conflict (id) do update set
  asset_key = excluded.asset_key,
  provider = excluded.provider,
  provider_symbol = excluded.provider_symbol,
  display_name = excluded.display_name,
  instrument_type = excluded.instrument_type,
  currency = excluded.currency,
  unit = excluded.unit,
  frequency = excluded.frequency,
  is_primary = excluded.is_primary,
  enabled = excluded.enabled,
  notes = excluded.notes,
  updated_at = now();

create or replace view public.asset_price_history_v1
with (security_invoker = false) as
select
  case s.asset_key
    when 'eurusd' then 'usd-eur'
    else s.asset_key
  end as frontend_asset_id,
  s.asset_key,
  s.instrument_id,
  i.provider,
  i.provider_symbol,
  i.display_name,
  i.instrument_type,
  i.currency,
  i.unit,
  i.frequency,
  i.is_primary,
  s.observation_date,
  s.price_timestamp,
  s.price,
  s.open,
  s.high,
  s.low,
  s.close,
  s.previous_price,
  s.change_abs,
  s.change_pct,
  s.is_market_open,
  s.source_url,
  s.retrieved_at,
  s.updated_at
from public.asset_price_snapshots_v2 s
join public.asset_instruments_v2 i
  on i.id = s.instrument_id
where i.enabled = true
  and s.observation_date is not null
  and s.price > 0;

comment on view public.asset_price_history_v1 is
  'Stage 6 public dated daily price history. Provider-labelled and unspliced; EURUSD remains USD per 1 EUR and presentation layers must explicitly invert it for the USD/EUR tile.';

revoke all on public.asset_price_history_v1 from public;
grant select on public.asset_price_history_v1 to anon, authenticated;
