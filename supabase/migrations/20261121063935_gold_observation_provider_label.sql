-- Correct the new series provider metadata; no price/history values are changed.
UPDATE public.asset_instruments_v2 SET provider='gold-api.com',updated_at=now()
WHERE id='gold_api_xau_observed_daily';
