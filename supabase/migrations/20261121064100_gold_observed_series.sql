-- Keep the old public cache internally before clearing restricted history.
CREATE TABLE public.legacy_gold_cache_20261121 AS
  SELECT * FROM public.cached_assets WHERE id = 'gold';
ALTER TABLE public.legacy_gold_cache_20261121 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_gold_cache_20261121 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.legacy_gold_cache_20261121 TO service_role;

ALTER TABLE public.cached_assets ALTER COLUMN change DROP NOT NULL;
-- Stop public exposure through the provider-labelled history view, without deleting rows.
UPDATE public.asset_instruments_v2 SET enabled = false, is_primary = false, updated_at = now()
WHERE asset_key = 'gold' AND is_primary;
UPDATE public.asset_instruments_v2 SET enabled = false, is_primary = false, updated_at = now()
WHERE id IN ('gold_twelve_xauusd_daily','gold_twelve_xauusd_quote');
INSERT INTO public.asset_instruments_v2
 (id,asset_key,provider,provider_symbol,display_name,instrument_type,currency,unit,frequency,is_primary,enabled,notes)
VALUES ('gold_api_xau_observed_daily','gold','gold-api.com','XAU',
 'Gold spot: last observed quote per UTC day (not official close)',
 'commodity_spot','USD','usd_per_troy_ounce','daily',true,true,
 'New series only. Last successfully received gold-api.com observation per UTC day; gaps stay missing. No Twelve Data backfill.');

-- A monotonic daily upsert: delayed concurrent requests cannot overwrite a newer quote.
CREATE FUNCTION public.record_gold_observation(p_price numeric, p_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE d date := (p_at AT TIME ZONE 'UTC')::date;
BEGIN
 IF p_price IS NULL OR p_price::text IN ('NaN','Infinity','-Infinity') OR p_price < 100 OR p_price > 50000
    OR p_at IS NULL OR p_at > now() + interval '2 minutes' OR p_at < now() - interval '3 days' THEN
   RAISE EXCEPTION 'Invalid gold observation';
 END IF;
 INSERT INTO public.asset_price_snapshots_v2 AS old
   (instrument_id,asset_key,observation_date,price_timestamp,snapshot_key,price,close,source_url,raw,updated_at)
 VALUES ('gold_api_xau_observed_daily','gold',d,p_at,'gold_api_xau_observed_daily|'||d::text||'|',
   p_price,NULL,'https://api.gold-api.com/price/XAU',
   jsonb_build_object('method','last_received_quote_per_utc_day','not_official_close',true),now())
 ON CONFLICT (snapshot_key) DO UPDATE SET price=EXCLUDED.price,price_timestamp=EXCLUDED.price_timestamp,
   updated_at=EXCLUDED.updated_at,raw=EXCLUDED.raw
 WHERE old.price_timestamp < EXCLUDED.price_timestamp;
END $$;
REVOKE ALL ON FUNCTION public.record_gold_observation(numeric,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_gold_observation(numeric,timestamptz) TO service_role;

-- Old daily snapshots remain internally intact but are no longer public.
-- Current site no longer queries these withdrawn archive surfaces.
REVOKE ALL PRIVILEGES ON public.daily_snapshots FROM PUBLIC,anon,authenticated;
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(quote_ident(attname), ', ') INTO cols FROM pg_attribute
 WHERE attrelid='public.daily_snapshots'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT (%s) ON public.daily_snapshots FROM PUBLIC,anon,authenticated',cols);
END $$;
-- The brief needs today's other markets, not restricted gold history in old snapshots.
CREATE VIEW public.daily_snapshots_public_v1 WITH (security_invoker=false) AS
 SELECT date,captured_at,
   COALESCE((SELECT jsonb_agg(a) FROM jsonb_array_elements(assets) a WHERE a->>'id' <> 'gold'),'[]'::jsonb) AS assets,
   russia
 FROM public.daily_snapshots;
REVOKE ALL ON public.daily_snapshots_public_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT (date,captured_at,assets,russia) ON public.daily_snapshots_public_v1 TO anon,authenticated;

UPDATE public.cached_assets SET sparkline='[]'::jsonb,spark_dates='[]'::jsonb,change=NULL,
 source_label='gold-api.com · последние наблюдения UTC, не официальный close'
WHERE id='gold';
-- Fail closed if an old writer runs during deployment.
ALTER TABLE public.cached_assets ADD CONSTRAINT gold_observed_source_only CHECK
 (id <> 'gold' OR source_label = 'gold-api.com · последние наблюдения UTC, не официальный close');

CREATE OR REPLACE VIEW public.asset_price_history_v1 WITH (security_invoker=false) AS
SELECT CASE lower(s.asset_key) WHEN 'eurusd' THEN 'usd-eur' ELSE lower(s.asset_key) END AS frontend_asset_id,
 s.asset_key,s.instrument_id,i.provider,i.provider_symbol,i.display_name,i.instrument_type,
 i.currency,i.unit,i.frequency,i.is_primary,s.observation_date,s.price_timestamp,s.price,
 s.open,s.high,s.low,s.close,s.previous_price,s.change_abs,s.change_pct,s.is_market_open,
 s.source_url,s.retrieved_at,s.updated_at
FROM public.asset_price_snapshots_v2 s JOIN public.asset_instruments_v2 i ON i.id=s.instrument_id
WHERE i.enabled=true AND s.observation_date IS NOT NULL AND s.price>0
 AND (s.instrument_id <> 'gold_api_xau_observed_daily' OR
      (s.observation_date < (now() AT TIME ZONE 'UTC')::date AND s.price_timestamp <= now()));
NOTIFY pgrst, 'reload schema';
