-- Do not export the current UTC Yahoo daily bar as a completed observation.
-- Brent and S&P snapshots select the latest closed session; XAU remains a
-- timestamped live observation and is intentionally allowed on the current day.
create or replace function public.export_static_snapshot_v1()
returns jsonb
language sql stable security definer
set search_path = ''
set row_security = on
as $function$
  select pg_catalog.jsonb_build_object(
    'exportedAt', pg_catalog.to_char(pg_catalog.statement_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', i.id, 'provider', i.provider, 'symbol', i.provider_symbol,
      'instrumentType', i.instrument_type, 'currency', i.currency,
      'unit', i.unit, 'frequency', i.frequency,
      'value', s.price::text, 'observationDate', s.observation_date::text,
      'priceTimestamp', case when s.price_timestamp is not null then
        pg_catalog.to_char(s.price_timestamp at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
      'sourceUrl', s.source_url
    ) order by i.id), '[]'::jsonb)
  )
  from public.asset_instruments_v2 i
  left join lateral (
    select p.price, p.observation_date, p.price_timestamp, p.source_url
    from public.asset_price_snapshots_v2 p
    where p.instrument_id = i.id
      and (i.id not in ('brent_yahoo_bzf', 'sp500_yahoo_gspc')
        or p.observation_date < (pg_catalog.statement_timestamp() at time zone 'UTC')::date)
    order by p.observation_date desc nulls last,
      p.price_timestamp desc nulls last, p.id desc
    limit 1
  ) s on true
  where i.id in ('brent_yahoo_bzf', 'sp500_yahoo_gspc', 'gold_api_xau_observed_daily')
    and i.enabled and i.is_primary;
$function$;

comment on function public.export_static_snapshot_v1() is
  'Exports the latest closed Yahoo daily observation for BZ=F and ^GSPC, plus the latest timestamped XAU observation. Current forming Yahoo daily bars are excluded.';
notify pgrst, 'reload schema';
