-- Market Pulse: public read model for the V2 "market memory".
--
-- Security model:
-- * Underlying shadow tables remain service_role-only (RLS on, grants revoked).
-- * These views expose a deliberately small, sanitized column set: no raw
--   model responses, no internal errors, no evidence/raw JSON blobs.
-- * Views run as owner (security_invoker=false) so anon needs SELECT only on
--   the views themselves, never on the shadow tables.

create or replace view public.market_memory_events_v1
with (security_invoker = false) as
select
  e.id as event_id,
  e.title,
  e.first_published_at,
  e.latest_published_at,
  e.article_count,
  e.source_count,
  e.sources,
  e.rank_score,
  c.status as classification_status,
  c.transmission_channel,
  c.relevance,
  c.confidence,
  c.importance,
  c.sentiment,
  coalesce(c.entities, '[]'::jsonb) as entities,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'asset', x ->> 'asset',
        'direction', x ->> 'direction',
        'strength', nullif(x ->> 'strength', '')::numeric,
        'horizon', x ->> 'horizon',
        'rationale_ru', left(coalesce(x ->> 'rationale_ru', ''), 500)
      )
      order by nullif(x ->> 'strength', '')::numeric desc nulls last
    )
    from jsonb_array_elements(coalesce(c.impacts, '[]'::jsonb)) as x
    where x ->> 'asset' in ('sp500', 'btc', 'Brent', 'gold', 'eurusd')
      and x ->> 'direction' in ('up', 'down', 'neutral', 'uncertain')
  ), '[]'::jsonb) as impacts,
  left(c.summary_ru, 700) as summary_ru,
  left(c.rationale_ru, 900) as rationale_ru,
  c.model,
  c.prompt_version,
  c.classified_at,
  rep.source_name as representative_source,
  rep.url as representative_url
from public.news_events_shadow e
join public.news_event_classifications_shadow c
  on c.event_id = e.id
 and c.status = 'classified'
left join lateral (
  select a.source_name, a.url
  from public.news_event_articles_shadow ea
  join public.news_articles_shadow a on a.id = ea.article_id
  where ea.event_id = e.id
  order by ea.is_representative desc, a.published_at desc nulls last
  limit 1
) rep on true;

create or replace view public.market_memory_event_outcomes_v1
with (security_invoker = false) as
select
  i.event_id,
  i.asset_key,
  i.expected_direction,
  i.expected_strength,
  i.horizon_trading_days,
  i.status,
  i.event_published_at,
  i.base_observation_date,
  i.outcome_observation_date,
  i.return_pct,
  i.abnormal_return_pct,
  i.abnormal_z,
  i.direction_hit,
  i.evaluated_at,
  c.transmission_channel,
  c.prompt_version
from public.event_price_impacts_v2 i
join public.news_event_classifications_shadow c
  on c.event_id = i.event_id
 and c.status = 'classified';

create or replace view public.market_memory_forecasts_v1
with (security_invoker = false) as
select
  f.id as forecast_id,
  f.asset_key,
  f.issued_at,
  f.issue_date,
  f.horizon_trading_days,
  f.direction,
  f.score_up,
  f.weighted_balance,
  f.evidence_count,
  f.base_observation_date,
  f.aggregation_version,
  f.model,
  f.prompt_version,
  o.status as outcome_status,
  o.outcome_observation_date,
  o.return_pct,
  o.abnormal_return_pct,
  o.abnormal_z,
  o.direction_hit,
  o.evaluated_at
from public.market_forecasts_v2 f
left join public.forecast_outcomes_v2 o
  on o.forecast_id = f.id;

create or replace view public.market_memory_analogues_v1
with (security_invoker = false) as
select
  c.transmission_channel,
  i.asset_key,
  i.expected_direction,
  i.horizon_trading_days,
  count(*)::bigint as sample_size,
  count(*) filter (where i.direction_hit is true)::bigint as hits,
  case when count(*) > 0
    then count(*) filter (where i.direction_hit is true)::numeric / count(*)::numeric
    else null end as hit_rate,
  percentile_cont(0.5) within group (order by i.return_pct)
    filter (where i.return_pct is not null) as median_return_pct,
  percentile_cont(0.5) within group (order by i.abnormal_return_pct)
    filter (where i.abnormal_return_pct is not null) as median_abnormal_return_pct,
  avg(i.return_pct) as avg_return_pct,
  max(i.evaluated_at) as last_evaluated_at
from public.event_price_impacts_v2 i
join public.news_event_classifications_shadow c
  on c.event_id = i.event_id
 and c.status = 'classified'
where i.status = 'evaluated'
  and i.expected_direction in ('up', 'down')
  and c.transmission_channel is not null
group by c.transmission_channel, i.asset_key, i.expected_direction, i.horizon_trading_days, c.prompt_version;

create or replace view public.market_memory_stats_v1
with (security_invoker = false) as
select
  (select count(*)::bigint from public.news_articles_shadow) as articles_total,
  (select count(*)::bigint from public.news_events_shadow) as events_total,
  (select count(*)::bigint from public.news_event_classifications_shadow where status = 'classified') as classified_events,
  (select count(*)::bigint from public.news_event_classifications_shadow where status = 'rejected') as rejected_events,
  (select count(*)::bigint from public.news_event_classifications_shadow where status = 'quarantine') as quarantined_events,
  (select count(*)::bigint from public.event_price_impacts_v2 where status = 'evaluated') as evaluated_event_outcomes,
  (select count(*)::bigint from public.event_price_impacts_v2 where status = 'pending') as pending_event_outcomes,
  (select count(*)::bigint from public.market_forecasts_v2) as forecast_snapshots,
  (select count(*)::bigint from public.forecast_outcomes_v2 where status = 'evaluated') as evaluated_forecasts,
  (select count(*)::bigint from public.forecast_outcomes_v2 where status = 'pending') as pending_forecasts,
  (select count(*)::bigint from public.asset_price_snapshots_v2) as price_snapshots,
  (select max(fetched_at) from public.news_articles_shadow) as latest_article_fetch_at,
  (select max(classified_at) from public.news_event_classifications_shadow) as latest_classification_at,
  (select max(retrieved_at) from public.asset_price_snapshots_v2) as latest_price_fetch_at,
  (select max(issued_at) from public.market_forecasts_v2) as latest_forecast_issued_at;

revoke all on public.market_memory_events_v1 from public;
revoke all on public.market_memory_event_outcomes_v1 from public;
revoke all on public.market_memory_forecasts_v1 from public;
revoke all on public.market_memory_analogues_v1 from public;
revoke all on public.market_memory_stats_v1 from public;

grant select on public.market_memory_events_v1 to anon, authenticated;
grant select on public.market_memory_event_outcomes_v1 to anon, authenticated;
grant select on public.market_memory_forecasts_v1 to anon, authenticated;
grant select on public.market_memory_analogues_v1 to anon, authenticated;
grant select on public.market_memory_stats_v1 to anon, authenticated;
