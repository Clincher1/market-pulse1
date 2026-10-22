-- Stage 3: numeric, provider-labelled price snapshots (shadow/internal).
--
-- canonical asset keys match the event classifier: sp500, btc, Brent, gold,
-- eurusd. EURUSD here means USD per 1 EUR (market convention). The current
-- frontend label USD/EUR is the inverse quote and must be converted at the
-- presentation layer instead of silently changing sign here.

create table if not exists public.asset_instruments_v2 (
  id text primary key,
  asset_key text not null check (asset_key in ('sp500', 'btc', 'Brent', 'gold', 'eurusd')),
  provider text not null,
  provider_symbol text not null,
  display_name text not null,
  instrument_type text not null,
  currency text,
  unit text not null,
  frequency text not null check (frequency in ('daily', 'intraday_snapshot')),
  is_primary boolean not null default false,
  enabled boolean not null default true,
  notes text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_price_runs_v2 (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'error')),
  instruments_total integer not null default 0,
  instruments_ok integer not null default 0,
  snapshots_upserted integer not null default 0,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.asset_price_snapshots_v2 (
  id bigserial primary key,
  instrument_id text not null references public.asset_instruments_v2(id),
  asset_key text not null check (asset_key in ('sp500', 'btc', 'Brent', 'gold', 'eurusd')),
  observation_date date,
  price_timestamp timestamptz,
  price numeric(24, 10) not null,
  open numeric(24, 10),
  high numeric(24, 10),
  low numeric(24, 10),
  close numeric(24, 10),
  previous_price numeric(24, 10),
  change_abs numeric(24, 10),
  change_pct numeric(16, 8),
  is_market_open boolean,
  source_url text not null,
  retrieved_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_price_snapshots_v2_time_present
    check (observation_date is not null or price_timestamp is not null)
);

create unique index if not exists asset_price_snapshots_v2_daily_unique
  on public.asset_price_snapshots_v2 (instrument_id, observation_date)
  where observation_date is not null;

create unique index if not exists asset_price_snapshots_v2_ts_unique
  on public.asset_price_snapshots_v2 (instrument_id, price_timestamp)
  where price_timestamp is not null and observation_date is null;

create index if not exists asset_price_snapshots_v2_asset_date_idx
  on public.asset_price_snapshots_v2 (asset_key, observation_date desc);

create index if not exists asset_price_snapshots_v2_asset_ts_idx
  on public.asset_price_snapshots_v2 (asset_key, price_timestamp desc);

alter table public.asset_instruments_v2 enable row level security;
alter table public.asset_price_runs_v2 enable row level security;
alter table public.asset_price_snapshots_v2 enable row level security;

revoke all on table public.asset_instruments_v2 from public, anon, authenticated;
revoke all on table public.asset_price_runs_v2 from public, anon, authenticated;
revoke all on table public.asset_price_snapshots_v2 from public, anon, authenticated;

grant select, insert, update, delete on table public.asset_instruments_v2 to service_role;
grant select, insert, update, delete on table public.asset_price_runs_v2 to service_role;
grant select, insert, update, delete on table public.asset_price_snapshots_v2 to service_role;
grant usage, select on sequence public.asset_price_runs_v2_id_seq to service_role;
grant usage, select on sequence public.asset_price_snapshots_v2_id_seq to service_role;

insert into public.asset_instruments_v2
  (id, asset_key, provider, provider_symbol, display_name, instrument_type,
   currency, unit, frequency, is_primary, enabled, notes)
values
  ('sp500_fred_sp500', 'sp500', 'FRED', 'SP500', 'S&P 500 (FRED SP500)',
   'cash_index', 'USD', 'index_points', 'daily', true, true,
   'Actual S&P 500 index level from FRED, not SPY and not multiplied.'),
  ('brent_fred_dcoilbrenteu', 'Brent', 'FRED/EIA', 'DCOILBRENTEU', 'Brent Europe spot (FRED DCOILBRENTEU)',
   'commodity_spot', 'USD', 'usd_per_barrel', 'daily', true, true,
   'Europe Brent spot price FOB in USD/barrel. Publication can lag one or more days.'),
  ('eurusd_ecb_daily', 'eurusd', 'ECB', 'USD', 'EUR/USD ECB daily reference',
   'fx_reference', 'USD', 'usd_per_eur', 'daily', true, true,
   'ECB euro foreign exchange reference rate: USD per 1 EUR. Frontend USD/EUR is the inverse.'),
  ('eurusd_fred_dexuseu', 'eurusd', 'FRED/Federal Reserve', 'DEXUSEU', 'EUR/USD noon buying rate (FRED DEXUSEU)',
   'fx_reference', 'USD', 'usd_per_eur', 'daily', false, true,
   'Cross-check only; publication lag is longer than ECB.'),
  ('btc_fred_coinbase', 'btc', 'FRED/Coinbase', 'CBBTCUSD', 'Bitcoin Coinbase daily (FRED CBBTCUSD)',
   'crypto_reference', 'USD', 'usd_per_btc', 'daily', true, true,
   'Daily Coinbase Bitcoin price republished by FRED.'),
  ('btc_kraken_xbtusd_daily', 'btc', 'Kraken', 'XBTUSD', 'Bitcoin / USD Kraken daily candles',
   'crypto_spot', 'USD', 'usd_per_btc', 'daily', false, true,
   'Kraken public XBT/USD daily OHLC candles. The latest candle can be partial.'),
  ('gold_fred_nasdaq_index', 'gold', 'FRED/Nasdaq', 'NASDAQQGLDI', 'Nasdaq Global Gold Index (FRED NASDAQQGLDI)',
   'price_index', null, 'index_points_not_usd_per_ounce', 'daily', true, true,
   'For daily return evaluation only. This is an index level, not a spot USD/oz price.'),
  ('gold_twelve_xauusd_quote', 'gold', 'Twelve Data', 'XAU/USD', 'Gold Spot / US Dollar (Twelve Data XAU/USD)',
   'commodity_spot', 'USD', 'usd_per_troy_ounce', 'intraday_snapshot', false, true,
   'Spot quote snapshot for display/provenance. Free-plan availability and freshness must be shown, not implied.'),
  ('sp500_twelve_spy_quote', 'sp500', 'Twelve Data', 'SPY', 'SPY ETF quote (secondary)',
   'ETF', 'USD', 'usd_per_share', 'intraday_snapshot', false, false,
   'SPX index is not available on the current Twelve Data plan. SPY is a tradable proxy, not the index.')
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
