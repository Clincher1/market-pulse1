-- Protect new snapshots without rewriting or validating legacy archive rows.
CREATE OR REPLACE FUNCTION public.daily_snapshot_assets_are_dated(payload jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp SET timezone = 'UTC' AS $$
DECLARE item jsonb; date_text text; quote_day date;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(payload) <> 5 THEN RETURN false; END IF;
  IF (SELECT count(DISTINCT a->>'id') FROM jsonb_array_elements(payload) a
      WHERE a->>'id' IN ('usd-eur','sp500','brent','gold','btc')) <> 5 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
    IF jsonb_typeof(item->'last') IS DISTINCT FROM 'number'
       OR (item->>'last')::numeric <= 0
       OR jsonb_typeof(item->'last_date') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'as_of') IS DISTINCT FROM 'string'
       OR coalesce(item->>'price','') = '' THEN RETURN false; END IF;
    date_text := item->>'last_date';
    IF date_text !~ '^\d{4}-\d{2}-\d{2}$'
       OR to_char(date_text::date,'YYYY-MM-DD') <> date_text THEN RETURN false; END IF;
    quote_day := ((item->>'as_of')::timestamptz AT TIME ZONE 'UTC')::date;
    IF date_text::date > quote_day THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.daily_snapshot_assets_are_dated(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daily_snapshot_assets_are_dated(jsonb) TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.daily_snapshots'::regclass
      AND conname = 'daily_snapshots_new_assets_dated') THEN
    ALTER TABLE public.daily_snapshots ADD CONSTRAINT daily_snapshots_new_assets_dated
      CHECK (public.daily_snapshot_assets_are_dated(assets)) NOT VALID;
  END IF;
END $$;
