-- Narrow public export; no source rows, existing grants or archived data are changed.
create role static_snapshot_reader nologin nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;
grant usage on schema public to static_snapshot_reader;
grant select (id, provider, provider_symbol, instrument_type, currency, unit,
  frequency, is_primary, enabled)
  on public.asset_instruments_v2 to static_snapshot_reader;
grant select (id, instrument_id, observation_date, price_timestamp, price, source_url)
  on public.asset_price_snapshots_v2 to static_snapshot_reader;

create policy static_snapshot_instruments_read on public.asset_instruments_v2
  for select to static_snapshot_reader
  using (id in ('brent_yahoo_bzf', 'sp500_yahoo_gspc', 'gold_api_xau_observed_daily'));
create policy static_snapshot_prices_read on public.asset_price_snapshots_v2
  for select to static_snapshot_reader
  using (instrument_id in ('brent_yahoo_bzf', 'sp500_yahoo_gspc', 'gold_api_xau_observed_daily'));

create function public.export_static_snapshot_v1()
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
    order by p.observation_date desc nulls last,
      p.price_timestamp desc nulls last, p.id desc
    limit 1
  ) s on true
  where i.id in ('brent_yahoo_bzf', 'sp500_yahoo_gspc', 'gold_api_xau_observed_daily')
    and i.enabled and i.is_primary;
$function$;

-- Ownership needs CREATE only during transfer. No caller can assume this role.
grant static_snapshot_reader to postgres;
grant create on schema public to static_snapshot_reader;
revoke all on function public.export_static_snapshot_v1() from public, anon, authenticated;
grant execute on function public.export_static_snapshot_v1() to anon, authenticated;
comment on function public.export_static_snapshot_v1() is
  'Public parameterless export of the latest stored BZ=F, ^GSPC and XAU observations. Numeric text preserves database precision. Caller must reject incomplete, invalid, future or stale exports.';
alter function public.export_static_snapshot_v1() owner to static_snapshot_reader;
revoke create on schema public from static_snapshot_reader;
revoke static_snapshot_reader from postgres;
notify pgrst, 'reload schema';
