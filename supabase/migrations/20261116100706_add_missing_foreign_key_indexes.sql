-- Add leading indexes for the foreign-key columns that currently lack coverage.
-- These are additive performance/constraint-check indexes; no historical rows are changed.
create index if not exists news_events_shadow_representative_article_idx
  on public.news_events_shadow (representative_article_id);

create index if not exists news_source_health_v2_run_id_idx
  on public.news_source_health_v2 (run_id);

create index if not exists asset_price_snapshots_v2_instrument_id_idx
  on public.asset_price_snapshots_v2 (instrument_id);

create index if not exists event_price_impacts_v2_instrument_id_idx
  on public.event_price_impacts_v2 (instrument_id);

create index if not exists market_forecasts_v2_instrument_id_idx
  on public.market_forecasts_v2 (instrument_id);
