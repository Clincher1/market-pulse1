-- Stage 4 schema: immutable forecast snapshots and price-based evaluation.
-- Shadow/internal only. Public cached_* forecasts are not changed by this.

create table if not exists public.market_forecasts_v2 (
  id text primary key,
  asset_key text not null check (asset_key in ('sp500', 'btc', 'Brent', 'gold', 'eurusd')),
  instrument_id text not null references public.asset_instruments_v2(id),
  issued_at timestamptz not null,
  issue_date date not null,
  horizon_trading_days integer not null check (horizon_trading_days in (1, 3, 10)),
  direction text not null check (direction in ('up', 'down', 'none')),
  score_up numeric(10, 6) check (score_up is null or (score_up >= 0 and score_up <= 1)),
  weighted_balance numeric(12, 6),
  evidence_count integer not null default 0,
  base_observation_date date,
  base_price numeric(24, 10),
  aggregation_version text not null,
  model text,
  prompt_version text,
  evidence jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (asset_key, issue_date, horizon_trading_days, aggregation_version)
);

create table if not exists public.forecast_outcomes_v2 (
  id bigserial primary key,
  forecast_id text not null references public.market_forecasts_v2(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'evaluated', 'insufficient_price_data')),
  outcome_observation_date date,
  outcome_price numeric(24, 10),
  return_pct numeric(16, 8),
  baseline_mean_daily_pct numeric(16, 8),
  baseline_volatility_daily_pct numeric(16, 8),
  abnormal_return_pct numeric(16, 8),
  abnormal_z numeric(16, 8),
  direction_hit boolean,
  Brier_score numeric(16, 8),
  evaluated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (forecast_id)
);

create table if not exists public.event_price_impacts_v2 (
  id bigserial primary key,
  event_id text not null references public.news_events_shadow(id) on delete cascade,
  asset_key text not null check (asset_key in ('sp500', 'btc', 'Brent', 'gold', 'eurusd')),
  instrument_id text not null references public.asset_instruments_v2(id),
  expected_direction text not null check (expected_direction in ('up', 'down', 'neutral', 'uncertain')),
  expected_strength numeric(10, 6),
  expected_horizon text,
  horizon_trading_days integer not null check (horizon_trading_days in (1, 3, 10)),
  status text not null default 'pending'
    check (status in ('pending', 'evaluated', 'insufficient_price_data')),
  event_published_at timestamptz,
  base_observation_date date,
  base_price numeric(24, 10),
  outcome_observation_date date,
  outcome_price numeric(24, 10),
  return_pct numeric(16, 8),
  baseline_observations integer,
  baseline_mean_daily_pct numeric(16, 8),
  baseline_volatility_daily_pct numeric(16, 8),
  abnormal_return_pct numeric(16, 8),
  abnormal_z numeric(16, 8),
  direction_hit boolean,
  evaluated_at timestamptz,
  evaluator_version text not null default 'event_study_v1',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, asset_key, horizon_trading_days, evaluator_version)
);

create index if not exists market_forecasts_v2_asset_issued_idx
  on public.market_forecasts_v2 (asset_key, issued_at desc);
create index if not exists event_price_impacts_v2_status_idx
  on public.event_price_impacts_v2 (status, asset_key, horizon_trading_days);
create index if not exists event_price_impacts_v2_event_idx
  on public.event_price_impacts_v2 (event_id);

alter table public.market_forecasts_v2 enable row level security;
alter table public.forecast_outcomes_v2 enable row level security;
alter table public.event_price_impacts_v2 enable row level security;

revoke all on table public.market_forecasts_v2 from public, anon, authenticated;
revoke all on table public.forecast_outcomes_v2 from public, anon, authenticated;
revoke all on table public.event_price_impacts_v2 from public, anon, authenticated;

grant select, insert, update, delete on table public.market_forecasts_v2 to service_role;
grant select, insert, update, delete on table public.forecast_outcomes_v2 to service_role;
grant select, insert, update, delete on table public.event_price_impacts_v2 to service_role;
grant usage, select on sequence public.forecast_outcomes_v2_id_seq to service_role;
grant usage, select on sequence public.event_price_impacts_v2_id_seq to service_role;
