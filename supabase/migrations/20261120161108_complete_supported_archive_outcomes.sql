-- Backfill only derived outcomes from the same original instrument.
-- Issuance stays disabled; forecast rows and already evaluated outcomes are immutable.
WITH points AS (
  SELECT instrument_id,observation_date,coalesce(close,price)::numeric AS price,
    row_number() OVER (PARTITION BY instrument_id ORDER BY observation_date) AS n
  FROM public.asset_price_snapshots_v2
  WHERE instrument_id IN ('btc_fred_coinbase','eurusd_ecb_daily','gold_fred_nasdaq_index')
    AND observation_date IS NOT NULL AND coalesce(close,price)>0
), returns AS (
  SELECT *, (price/lag(price) OVER (PARTITION BY instrument_id ORDER BY observation_date)-1)*100 AS daily_return FROM points
), eligible AS (
  SELECT f.id AS forecast_id,f.instrument_id,f.direction,f.score_up,
    b.observation_date AS base_date,b.price AS base_price,
    x.observation_date AS outcome_date,x.price AS outcome_price,x.n-b.n AS steps,
    (x.price/b.price-1)*100 AS return_pct,s.mean,s.volatility,s.observations
  FROM public.market_forecasts_v2 f JOIN public.forecast_outcomes_v2 o ON o.forecast_id=f.id AND o.status='pending'
  CROSS JOIN LATERAL (SELECT * FROM returns p WHERE p.instrument_id=f.instrument_id AND p.observation_date<f.issue_date ORDER BY p.observation_date DESC LIMIT 1) b
  CROSS JOIN LATERAL (SELECT * FROM returns p WHERE p.instrument_id=f.instrument_id AND p.observation_date>f.issue_date ORDER BY p.observation_date OFFSET greatest(f.horizon_trading_days-1,0) LIMIT 1) x
  CROSS JOIN LATERAL (SELECT avg(daily_return) AS mean,stddev_samp(daily_return) AS volatility,count(*) AS observations FROM (
    SELECT daily_return FROM returns p WHERE p.instrument_id=f.instrument_id AND p.observation_date<=b.observation_date AND daily_return IS NOT NULL ORDER BY p.observation_date DESC LIMIT 60
  ) r) s
  WHERE f.horizon_trading_days>0 AND s.observations>=20 AND f.issue_date<='2026-10-31'
)
UPDATE public.forecast_outcomes_v2 o SET
  status='evaluated',outcome_observation_date=e.outcome_date,outcome_price=e.outcome_price,
  return_pct=e.return_pct,baseline_mean_daily_pct=e.mean,baseline_volatility_daily_pct=e.volatility,
  abnormal_return_pct=e.return_pct-e.mean*e.steps,
  abnormal_z=CASE WHEN e.volatility>0 AND e.steps>0 THEN (e.return_pct-e.mean*e.steps)/(e.volatility*sqrt(e.steps::numeric)) ELSE NULL END,
  direction_hit=CASE WHEN e.direction='up' THEN e.return_pct>0 WHEN e.direction='down' THEN e.return_pct<0 ELSE NULL END,
  brier_score=CASE WHEN e.direction<>'none' AND e.score_up IS NOT NULL AND e.return_pct<>0 THEN power(e.score_up-CASE WHEN e.return_pct>0 THEN 1 ELSE 0 END,2) ELSE NULL END,
  evaluated_at=now(),updated_at=now(),
  raw=coalesce(o.raw,'{}'::jsonb)||jsonb_build_object('evaluation_version','archive_same_instrument_20261120','instrument_id',e.instrument_id,'base_observation_date',e.base_date,'base_price',e.base_price,'observation_steps_from_base',e.steps,'baseline_observations',e.observations,'alignment','Last observation strictly before issue_date; horizon-th observation strictly after issue_date; same original instrument only')
FROM eligible e WHERE o.forecast_id=e.forecast_id AND o.status='pending';

-- No substitute instrument: old FRED series have no horizon coverage.
UPDATE public.forecast_outcomes_v2 o SET status='insufficient_price_data',evaluated_at=NULL,updated_at=now(),
  raw=coalesce(o.raw,'{}'::jsonb)||jsonb_build_object('reason','original_instrument_horizon_unavailable','instrument_id',f.instrument_id,'required_observations_after_issue',f.horizon_trading_days,'available_observations_after_issue',(SELECT count(DISTINCT p.observation_date) FROM public.asset_price_snapshots_v2 p WHERE p.instrument_id=f.instrument_id AND p.observation_date>f.issue_date AND coalesce(p.close,p.price)>0),'evaluation_version','archive_same_instrument_20261120')
FROM public.market_forecasts_v2 f WHERE o.forecast_id=f.id AND o.status='pending'
 AND f.issue_date<='2026-10-31' AND f.instrument_id IN ('brent_fred_dcoilbrenteu','sp500_fred_sp500')
 AND (SELECT count(DISTINCT p.observation_date) FROM public.asset_price_snapshots_v2 p WHERE p.instrument_id=f.instrument_id AND p.observation_date>f.issue_date AND coalesce(p.close,p.price)>0)<f.horizon_trading_days;
