-- Make the daily XAU row's first and most recent fetch times explicit.
-- retrieved_at becomes the latest retrieval; first_retrieved_at preserves the
-- first fetch for that UTC-day row across monotonic quote updates.
ALTER TABLE public.asset_price_snapshots_v2
  ADD COLUMN IF NOT EXISTS first_retrieved_at timestamptz;

UPDATE public.asset_price_snapshots_v2
SET first_retrieved_at = retrieved_at
WHERE instrument_id = 'gold_api_xau_observed_daily'
  AND first_retrieved_at IS NULL;

COMMENT ON COLUMN public.asset_price_snapshots_v2.retrieved_at IS
  'Time this observation row was most recently retrieved from its provider.';
COMMENT ON COLUMN public.asset_price_snapshots_v2.first_retrieved_at IS
  'First retrieval time for this observation row; preserved when its daily quote is updated.';

CREATE OR REPLACE FUNCTION public.record_gold_observation(p_price numeric, p_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE d date := (p_at AT TIME ZONE 'UTC')::date;
BEGIN
 IF p_price IS NULL OR p_price::text IN ('NaN','Infinity','-Infinity') OR p_price < 100 OR p_price > 50000
    OR p_at IS NULL OR p_at > now() + interval '2 minutes' OR p_at < now() - interval '3 days' THEN
   RAISE EXCEPTION 'Invalid gold observation';
 END IF;
 INSERT INTO public.asset_price_snapshots_v2 AS old
   (instrument_id,asset_key,observation_date,price_timestamp,snapshot_key,price,close,source_url,raw,
    retrieved_at,first_retrieved_at,updated_at)
 VALUES ('gold_api_xau_observed_daily','gold',d,p_at,'gold_api_xau_observed_daily|'||d::text||'|',
   p_price,NULL,'https://api.gold-api.com/price/XAU',
   jsonb_build_object('method','last_received_quote_per_utc_day','not_official_close',true),
   now(),now(),now())
 ON CONFLICT (snapshot_key) DO UPDATE SET
   price=CASE WHEN old.price_timestamp < EXCLUDED.price_timestamp THEN EXCLUDED.price ELSE old.price END,
   price_timestamp=CASE WHEN old.price_timestamp < EXCLUDED.price_timestamp THEN EXCLUDED.price_timestamp ELSE old.price_timestamp END,
   retrieved_at=EXCLUDED.retrieved_at,
   first_retrieved_at=COALESCE(old.first_retrieved_at,old.retrieved_at),
   updated_at=EXCLUDED.updated_at,
   raw=CASE WHEN old.price_timestamp < EXCLUDED.price_timestamp THEN EXCLUDED.raw ELSE old.raw END;
END $$;

-- Keep the extra timestamp visible to trusted audit/worker queries without
-- widening the browser's already-restricted projection.
CREATE OR REPLACE VIEW public.asset_price_history_v1
WITH (security_invoker = false) AS
SELECT CASE lower(s.asset_key) WHEN 'eurusd' THEN 'usd-eur' ELSE lower(s.asset_key) END AS frontend_asset_id,
 s.asset_key,s.instrument_id,i.provider,i.provider_symbol,i.display_name,i.instrument_type,
 i.currency,i.unit,i.frequency,i.is_primary,s.observation_date,s.price_timestamp,s.price,
 s.open,s.high,s.low,s.close,s.previous_price,s.change_abs,s.change_pct,s.is_market_open,
 s.source_url,s.retrieved_at,s.updated_at,s.first_retrieved_at
FROM public.asset_price_snapshots_v2 s
JOIN public.asset_instruments_v2 i ON i.id=s.instrument_id
WHERE i.enabled=true AND s.observation_date IS NOT NULL AND s.price>0
 AND (s.instrument_id <> 'gold_api_xau_observed_daily' OR
      (s.observation_date < (now() AT TIME ZONE 'UTC')::date AND s.price_timestamp <= now()));

COMMENT ON VIEW public.asset_price_history_v1 IS
  'Provider-labelled dated daily history; XAU retrieved_at is the latest fetch and first_retrieved_at is preserved for the first fetch of each UTC-day quote.';
NOTIFY pgrst, 'reload schema';
