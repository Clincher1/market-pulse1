-- Stage 6 correction (2026-10-27): the shadow Brent instrument uses the
-- asset_key 'Brent', while every public tile/frontend asset ID is lowercase.
-- Normalize frontend_asset_id in the public read model so `usd-eur`,
-- `sp500`, `Brent`, `gold`, and `btc` match the UI exactly. The underlying
-- provider-labelled instrument choice is unchanged and series remain
-- unspliced.

create or replace view public.asset_price_history_v1
with (security_invoker = false) as
select
  case lower(s.asset_key)
    when 'eurusd' then 'usd-eur'
    else lower(s.asset_key)
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
  'Stage 6 public dated daily price history. Provider-labelled and unspliced; frontend_asset_id is lowercase; EURUSD remains USD per 1 EUR and presentation layers must explicitly invert it for the USD/EUR tile.';

revoke all on public.asset_price_history_v1 from public;
grant select on public.asset_price_history_v1 to anon, authenticated;
