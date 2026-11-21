-- Revoke column privileges too: table-level REVOKE alone does not remove them.
-- Original records and internal/service access are preserved.
DO $$
DECLARE v text; cols text;
BEGIN
  FOREACH v IN ARRAY ARRAY['market_memory_forecasts_v1','market_memory_stats_v1'] LOOP
    SELECT string_agg(quote_ident(attname), ', ') INTO cols
      FROM pg_attribute WHERE attrelid = ('public.' || v)::regclass
      AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', v);
    EXECUTE format('REVOKE SELECT (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated', cols, v);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
