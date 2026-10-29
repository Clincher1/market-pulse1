-- Make the track record say how much of it can be scored at all.
--
-- Brier needs a side to be wrong about: a forecast that honestly said "нет
-- сигнала" can never be scored, no matter how much time passes. Without this
-- column the page reads "проверено 22 из 120" and looks like the site is
-- failing to evaluate its own forecasts, when most of the remainder are
-- deliberate silence. BTC is the extreme case: 24 forecasts, direction = 'none'
-- on every one, so it will never score until it gets directional evidence.
--
-- Appended as the last column on purpose: CREATE OR REPLACE VIEW can only add
-- columns at the end, and both branches of the UNION must agree.

create or replace view public.forecast_track_record as
with joined as (
  select
    f.asset_key,
    f.direction,
    o.status,
    o.brier_score,
    o.direction_hit,
    o.return_pct,
    o.evaluated_at
  from public.market_forecasts_v2 f
  join public.forecast_outcomes_v2 o on o.forecast_id = f.id
)
select
  'ALL'::text as asset_key,
  count(*)::integer as issued,
  count(*) filter (where joined.status = 'evaluated')::integer as resolved,
  count(joined.brier_score)::integer as scored,
  round(avg(joined.brier_score), 4) as mean_brier,
  round(
    count(*) filter (where joined.direction_hit)::numeric
      / nullif(count(joined.direction_hit), 0)::numeric,
    3
  ) as hit_rate,
  round(avg(joined.return_pct), 3) as mean_return_pct,
  count(*) filter (where joined.status = 'pending')::integer as pending,
  max(joined.evaluated_at) as last_evaluated_at,
  case
    when count(joined.brier_score) < 30 then 'insufficient_data'::text
    when avg(joined.brier_score) > 0.24 then 'no_edge'::text
    else 'edge'::text
  end as verdict,
  count(*) filter (where joined.direction is not null and joined.direction <> 'none')::integer as directional
from joined
union all
select
  joined.asset_key,
  count(*)::integer as issued,
  count(*) filter (where joined.status = 'evaluated')::integer as resolved,
  count(joined.brier_score)::integer as scored,
  round(avg(joined.brier_score), 4) as mean_brier,
  round(
    count(*) filter (where joined.direction_hit)::numeric
      / nullif(count(joined.direction_hit), 0)::numeric,
    3
  ) as hit_rate,
  round(avg(joined.return_pct), 3) as mean_return_pct,
  count(*) filter (where joined.status = 'pending')::integer as pending,
  max(joined.evaluated_at) as last_evaluated_at,
  case
    when count(joined.brier_score) < 30 then 'insufficient_data'::text
    when avg(joined.brier_score) > 0.24 then 'no_edge'::text
    else 'edge'::text
  end as verdict,
  count(*) filter (where joined.direction is not null and joined.direction <> 'none')::integer as directional
from joined
group by joined.asset_key;
